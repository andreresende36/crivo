import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, resolve, extname, basename } from 'path'
import { execSync } from 'child_process'

const server = new Server(
  { name: 'mcp-test-intelligence', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_tests',
      description:
        'Finds all test files matching common patterns and returns test names extracted from them.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Optional glob-style substring to filter test file paths.',
          },
          directory: {
            type: 'string',
            description: 'Directory to scan. Defaults to cwd.',
          },
        },
      },
    },
    {
      name: 'find_untested_code',
      description:
        'Reads an existing Vitest/Jest coverage JSON report and returns files below the given threshold.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project root. Defaults to cwd.' },
          threshold: { type: 'number', default: 80, description: 'Coverage % threshold.' },
          coveragePath: {
            type: 'string',
            description:
              'Path to coverage-summary.json. Defaults to coverage/coverage-summary.json.',
          },
        },
      },
    },
    {
      name: 'suggest_test_cases',
      description:
        'Reads a source file and generates suggested test case descriptions for each exported function/class.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Path to source file.' },
        },
        required: ['filePath'],
      },
    },
    {
      name: 'find_flaky_tests',
      description:
        'Reads .claude/test_runs.jsonl (if exists) and identifies tests that sometimes pass and sometimes fail.',
      inputSchema: {
        type: 'object',
        properties: {
          historyPath: {
            type: 'string',
            description: 'Path to test history JSONL file. Defaults to .claude/test_runs.jsonl.',
          },
        },
      },
    },
    {
      name: 'get_test_performance',
      description: 'Reads test files and analyzes them for potential performance issues (e.g., no timeouts, heavy setup). If vitest is available, runs tests and reports slow ones.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Project root. Defaults to cwd.' },
          runTests: {
            type: 'boolean',
            default: false,
            description: 'If true, attempts to run vitest and collect timing. Warning: may be slow.',
          },
        },
      },
    },
  ],
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx)$/,
  /\.spec\.(ts|tsx|js|jsx)$/,
  /^test_.*\.py$/,
  /_test\.py$/,
  /_spec\.rb$/,
]

function isTestFile(filePath: string): boolean {
  const base = basename(filePath)
  return TEST_PATTERNS.some((p) => p.test(base))
}

function walkDir(dir: string, maxDepth = 8, depth = 0): string[] {
  if (depth > maxDepth) return []
  const files: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build') continue
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) files.push(...walkDir(full, maxDepth, depth + 1))
      else files.push(full)
    }
  } catch { /* skip */ }
  return files
}

function extractTestNames(content: string): string[] {
  const names: string[] = []
  // Jest/Vitest: it('name', ...) or test('name', ...) or describe('name', ...)
  const testRe = /(?:it|test|describe)\s*\(\s*['"`]([^'"`]+)['"`]/g
  let match: RegExpExecArray | null
  while ((match = testRe.exec(content)) !== null) {
    names.push(match[1])
  }
  // Python: def test_something
  const pyRe = /def\s+(test_\w+)/g
  while ((match = pyRe.exec(content)) !== null) {
    names.push(match[1])
  }
  return names
}

function extractExportedSymbols(content: string): { type: 'function' | 'class' | 'const'; name: string }[] {
  const symbols: { type: 'function' | 'class' | 'const'; name: string }[] = []
  const exportRe =
    /export\s+(?:(async\s+)?function\s+(\w+)|(class)\s+(\w+)|(const|let|var)\s+(\w+))/g
  let m: RegExpExecArray | null
  while ((m = exportRe.exec(content)) !== null) {
    if (m[2]) symbols.push({ type: 'function', name: m[2] })
    else if (m[3]) symbols.push({ type: 'class', name: m[4]! })
    else if (m[5]) symbols.push({ type: 'const', name: m[6]! })
  }
  // Also check default exports
  const defaultRe = /export\s+default\s+(?:(async\s+)?function\s+(\w+)?|class\s+(\w+)?)/g
  while ((m = defaultRe.exec(content)) !== null) {
    const n = m[2] ?? m[3]
    if (n) symbols.push({ type: m[3] ? 'class' : 'function', name: n })
  }
  return symbols
}

function generateTestSuggestions(
  symbol: { type: 'function' | 'class' | 'const'; name: string }
): string[] {
  const { type, name } = symbol
  if (type === 'function') {
    return [
      `should return expected value when called with valid input`,
      `should throw an error when called with invalid input`,
      `should handle edge cases (null, undefined, empty string)`,
      `should be idempotent if applicable`,
    ].map((s) => `${name}: ${s}`)
  }
  if (type === 'class') {
    return [
      `should instantiate correctly with valid constructor params`,
      `should throw if constructed with invalid params`,
      `should expose correct public API`,
      `should handle state mutations correctly`,
    ].map((s) => `${name}: ${s}`)
  }
  return [`${name}: should have the expected value or shape`]
}

// ─── Request Handler ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  if (!args) throw new McpError(ErrorCode.InvalidParams, 'Missing arguments')

  switch (name) {
    // ── list_tests ─────────────────────────────────────────────────────────────
    case 'list_tests': {
      try {
        const directory = resolve(process.cwd(), (args as Record<string, string>).directory ?? '.')
        const pattern = (args as Record<string, string>).pattern

        const allFiles = walkDir(directory)
        const testFiles = allFiles.filter(isTestFile)
        const filtered = pattern ? testFiles.filter((f) => f.includes(pattern)) : testFiles

        const result = filtered.map((file) => {
          let tests: string[] = []
          try {
            const content = readFileSync(file, 'utf-8')
            tests = extractTestNames(content)
          } catch { /* skip */ }
          return { file, testCount: tests.length, tests }
        })

        const totalTests = result.reduce((sum, f) => sum + f.testCount, 0)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { totalTestFiles: filtered.length, totalTests, files: result },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
      }
    }

    // ── find_untested_code ─────────────────────────────────────────────────────
    case 'find_untested_code': {
      try {
        const directory = resolve(process.cwd(), (args as Record<string, string>).directory ?? '.')
        const threshold = Number((args as Record<string, unknown>).threshold ?? 80)
        const coveragePath = resolve(
          directory,
          (args as Record<string, string>).coveragePath ?? 'coverage/coverage-summary.json'
        )

        if (!existsSync(coveragePath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Coverage file not found at: ${coveragePath}`,
                    tip: 'Run: npx vitest run --coverage --reporter=json first, then check coverage/coverage-summary.json',
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        const raw = JSON.parse(readFileSync(coveragePath, 'utf-8')) as Record<
          string,
          {
            lines: { pct: number }
            branches: { pct: number }
            functions: { pct: number }
            statements: { pct: number }
          }
        >

        const uncovered: {
          file: string
          lines: number
          branches: number
          functions: number
          statements: number
        }[] = []

        for (const [file, stats] of Object.entries(raw)) {
          if (file === 'total') continue
          const linePct = stats.lines?.pct ?? 0
          if (linePct < threshold) {
            uncovered.push({
              file,
              lines: linePct,
              branches: stats.branches?.pct ?? 0,
              functions: stats.functions?.pct ?? 0,
              statements: stats.statements?.pct ?? 0,
            })
          }
        }

        uncovered.sort((a, b) => a.lines - b.lines)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  threshold,
                  untestedFiles: uncovered.length,
                  files: uncovered,
                  total: raw['total'] ?? null,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
      }
    }

    // ── suggest_test_cases ─────────────────────────────────────────────────────
    case 'suggest_test_cases': {
      try {
        const filePath = resolve(process.cwd(), (args as Record<string, string>).filePath)
        const content = readFileSync(filePath, 'utf-8')
        const symbols = extractExportedSymbols(content)

        const suggestions = symbols.map((sym) => ({
          symbol: sym.name,
          type: sym.type,
          suggestedTests: generateTestSuggestions(sym),
        }))

        const vitestTemplate =
          suggestions.length > 0
            ? `import { describe, it, expect } from 'vitest'
import { ${suggestions.map((s) => s.symbol).join(', ')} } from './${basename(filePath, extname(filePath))}'

${suggestions.map((s) => `describe('${s.symbol}', () => {
${s.suggestedTests.map((t) => `  it('${t.replace(s.symbol + ': ', '')}', () => {
    // TODO: implement test
    expect(true).toBe(true)
  })`).join('\n\n')}
})`).join('\n\n')}`
            : '// No exported symbols found'

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  file: filePath,
                  exportedSymbols: symbols.length,
                  suggestions,
                  vitestTemplate,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
      }
    }

    // ── find_flaky_tests ───────────────────────────────────────────────────────
    case 'find_flaky_tests': {
      try {
        const historyPath = resolve(
          process.cwd(),
          (args as Record<string, string>).historyPath ?? '.claude/test_runs.jsonl'
        )

        if (!existsSync(historyPath)) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: 'No test history file found.',
                    expectedPath: historyPath,
                    tip: 'Create .claude/test_runs.jsonl with entries like: {"name":"test name","passed":true,"duration":120,"timestamp":"..."}',
                    flakyTests: [],
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        const lines = readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean)
        const testRuns = new Map<
          string,
          { passed: boolean[]; durations: number[] }
        >()

        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as {
              name: string
              passed: boolean
              duration?: number
            }
            if (!testRuns.has(entry.name)) {
              testRuns.set(entry.name, { passed: [], durations: [] })
            }
            const rec = testRuns.get(entry.name)!
            rec.passed.push(entry.passed)
            if (entry.duration) rec.durations.push(entry.duration)
          } catch { /* skip malformed */ }
        }

        const flaky: {
          name: string
          runs: number
          passRate: number
          failRate: number
          avgDuration: number
        }[] = []

        for (const [testName, data] of testRuns) {
          const passes = data.passed.filter(Boolean).length
          const fails = data.passed.length - passes
          if (passes > 0 && fails > 0) {
            const avgDuration =
              data.durations.length > 0
                ? Math.round(data.durations.reduce((a, b) => a + b, 0) / data.durations.length)
                : 0
            flaky.push({
              name: testName,
              runs: data.passed.length,
              passRate: parseFloat(((passes / data.passed.length) * 100).toFixed(1)),
              failRate: parseFloat(((fails / data.passed.length) * 100).toFixed(1)),
              avgDuration,
            })
          }
        }

        flaky.sort((a, b) => a.passRate - b.passRate)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalTestsTracked: testRuns.size,
                  flakyTestsFound: flaky.length,
                  flakyTests: flaky,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
      }
    }

    // ── get_test_performance ───────────────────────────────────────────────────
    case 'get_test_performance': {
      try {
        const directory = resolve(process.cwd(), (args as Record<string, string>).directory ?? '.')
        const runTests = Boolean((args as Record<string, unknown>).runTests ?? false)

        if (runTests) {
          // Try to run vitest with json reporter
          try {
            const output = execSync('npx vitest run --reporter=json 2>/dev/null', {
              cwd: directory,
              encoding: 'utf-8',
              timeout: 60000,
            })
            const data = JSON.parse(output) as {
              testResults: Array<{
                testFilePath: string
                perfStats: { start: number; end: number }
                testResults: Array<{ fullName: string; duration: number }>
              }>
            }

            const allTests: { name: string; file: string; durationMs: number }[] = []
            for (const suite of data.testResults) {
              for (const test of suite.testResults) {
                allTests.push({
                  name: test.fullName,
                  file: suite.testFilePath,
                  durationMs: test.duration,
                })
              }
            }

            allTests.sort((a, b) => b.durationMs - a.durationMs)
            const slowTests = allTests.filter((t) => t.durationMs > 100)

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      totalTests: allTests.length,
                      slowTests: slowTests.length,
                      top10Slowest: allTests.slice(0, 10),
                    },
                    null,
                    2
                  ),
                },
              ],
            }
          } catch {
            // Fall through to static analysis
          }
        }

        // Static analysis of test files for performance anti-patterns
        const allFiles = walkDir(directory)
        const testFiles = allFiles.filter(isTestFile)

        const antiPatterns: {
          file: string
          line: number
          issue: string
          severity: 'warning' | 'info'
        }[] = []

        for (const file of testFiles) {
          try {
            const content = readFileSync(file, 'utf-8')
            const lines = content.split('\n')

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i]
              const lineNum = i + 1

              if (/await.*sleep\s*\(|setTimeout\s*\(/.test(line)) {
                antiPatterns.push({
                  file,
                  line: lineNum,
                  issue: 'Explicit sleep/setTimeout in test — use fake timers instead',
                  severity: 'warning',
                })
              }
              if (/new\s+Date\(\)|Date\.now\(\)/.test(line) && !line.includes('mock')) {
                antiPatterns.push({
                  file,
                  line: lineNum,
                  issue: 'Unstable Date usage — consider mocking time',
                  severity: 'info',
                })
              }
              if (/beforeAll|afterAll/.test(line) && /fetch|http|axios|request/.test(content)) {
                antiPatterns.push({
                  file,
                  line: lineNum,
                  issue: 'Possible real HTTP calls in test setup — ensure mocking',
                  severity: 'warning',
                })
              }
            }
          } catch { /* skip */ }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  mode: 'static-analysis',
                  testFilesScanned: testFiles.length,
                  antiPatternsFound: antiPatterns.length,
                  issues: antiPatterns,
                  tip: 'Set runTests: true to actually execute tests and get real timing data.',
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
