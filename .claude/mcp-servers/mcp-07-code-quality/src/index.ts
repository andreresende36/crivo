import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, extname, resolve } from 'path'

const server = new Server(
  { name: 'mcp-code-quality', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'analyze_complexity',
      description:
        'Reads a source file and calculates cyclomatic complexity per function. >10 = high, >20 = critical.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Absolute or relative path to source file' },
        },
        required: ['filePath'],
      },
    },
    {
      name: 'find_code_smells',
      description:
        'Scans a directory for code smells: god classes (>300 lines), long methods (>50 lines), many params (>5), many exports (>10).',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to scan' },
        },
        required: ['directory'],
      },
    },
    {
      name: 'find_duplicates',
      description:
        'Finds identical or near-identical code blocks across files in a directory.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to scan' },
          minLines: { type: 'number', default: 5, description: 'Minimum block size to consider' },
        },
        required: ['directory'],
      },
    },
    {
      name: 'find_circular_deps',
      description:
        'Analyzes the import graph starting from an entry file and detects circular dependency cycles.',
      inputSchema: {
        type: 'object',
        properties: {
          entryFile: {
            type: 'string',
            description: 'Entry point file. Defaults to src/index.ts in cwd.',
          },
        },
      },
    },
    {
      name: 'get_quality_score',
      description:
        'Aggregates complexity, smells, duplicates, and circular deps into a quality score 0–100.',
      inputSchema: {
        type: 'object',
        properties: {
          directory: { type: 'string', description: 'Directory to analyze' },
        },
        required: ['directory'],
      },
    },
  ],
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cs', '.go'])

function walkDir(dir: string, maxDepth = 6, depth = 0): string[] {
  if (depth > maxDepth) return []
  const files: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build') continue
      const full = join(dir, entry)
      const stat = statSync(full)
      if (stat.isDirectory()) {
        files.push(...walkDir(full, maxDepth, depth + 1))
      } else if (CODE_EXTENSIONS.has(extname(entry))) {
        files.push(full)
      }
    }
  } catch { /* ignore unreadable dirs */ }
  return files
}

function countLines(content: string): number {
  return content.split('\n').length
}

// ─── analyze_complexity ───────────────────────────────────────────────────────

interface FunctionComplexity {
  name: string
  startLine: number
  complexity: number
  level: 'low' | 'moderate' | 'high' | 'critical'
}

const COMPLEXITY_KEYWORDS = /\b(if|else|else\s+if|for|while|do|switch|case|catch|finally|\?)\b/g

function analyzeComplexity(filePath: string): FunctionComplexity[] {
  const absPath = resolve(process.cwd(), filePath)
  const content = readFileSync(absPath, 'utf-8')
  const lines = content.split('\n')

  // Simple function extraction: look for function declarations / arrow functions
  const functionPattern =
    /(?:(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(|(?:class\s+\w+[^{]*\{[^}]*)\b(\w+)\s*\([^)]*\)\s*\{)/g

  const functions: FunctionComplexity[] = []
  let match: RegExpExecArray | null

  const fullRe = /(?:(?:async\s+)?function\s+(\w+)\s*\()|(?:(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*\S+\s*)?>)|(?:\b(\w+)\s*\([^)]*\)\s*\{)/g

  // Track brace depth to find function boundaries
  const functionStarts: { name: string; startLine: number; braceDepth: number }[] = []
  let braceDepth = 0
  let activeFunctions: typeof functionStarts = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Detect function names
    const fnMatch = line.match(
      /(?:(?:async\s+)?function\s+(\w+))|(?:(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\()|(?:\b([\w$]+)\s*\([^)]*\)\s*\{)/
    )
    if (fnMatch) {
      const fnName = fnMatch[1] ?? fnMatch[2] ?? fnMatch[3] ?? 'anonymous'
      // Skip keywords that match the pattern
      if (!['if', 'for', 'while', 'switch', 'catch', 'else'].includes(fnName)) {
        functionStarts.push({ name: fnName, startLine: i + 1, braceDepth })
      }
    }

    // Count braces
    for (const ch of line) {
      if (ch === '{') braceDepth++
      else if (ch === '}') {
        braceDepth--
        // Check if any functions ended at this depth
        const ended = functionStarts.filter((f) => f.braceDepth === braceDepth)
        for (const f of ended) {
          const idx = functionStarts.indexOf(f)
          functionStarts.splice(idx, 1)
        }
      }
    }
  }

  // Simpler approach: extract function bodies using regex and count decision points
  const funcBodyRe =
    /(?:(?:async\s+)?function\s+(\w+)\s*\([^)]*\)(?:\s*:\s*\S+)?\s*\{)|(?:(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)(?:\s*:\s*\S+)?\s*=>?\s*\{)/g

  let funcMatch: RegExpExecArray | null
  while ((funcMatch = funcBodyRe.exec(content)) !== null) {
    const funcName = funcMatch[1] ?? funcMatch[2] ?? 'anonymous'
    const startIdx = funcMatch.index
    const startLine = content.slice(0, startIdx).split('\n').length

    // Extract body by counting braces
    let depth = 0
    let bodyEnd = startIdx
    let foundOpen = false
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') { depth++; foundOpen = true }
      else if (content[i] === '}') {
        depth--
        if (foundOpen && depth === 0) { bodyEnd = i; break }
      }
    }

    const body = content.slice(startIdx, bodyEnd + 1)
    const complexityMatches = body.match(COMPLEXITY_KEYWORDS) ?? []
    const complexity = complexityMatches.length + 1 // +1 for the function itself

    functions.push({
      name: funcName,
      startLine,
      complexity,
      level:
        complexity > 20 ? 'critical' :
        complexity > 10 ? 'high' :
        complexity > 5  ? 'moderate' : 'low',
    })
  }

  return functions
}

// ─── find_code_smells ─────────────────────────────────────────────────────────

interface CodeSmell {
  type: string
  file: string
  detail: string
  severity: 'warning' | 'error'
}

function findCodeSmells(directory: string): CodeSmell[] {
  const smells: CodeSmell[] = []
  const files = walkDir(resolve(process.cwd(), directory))

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      const lineCount = lines.length

      // God class / god file (>300 lines)
      if (lineCount > 300) {
        smells.push({
          type: 'god_class',
          file,
          detail: `File has ${lineCount} lines (threshold: 300)`,
          severity: lineCount > 600 ? 'error' : 'warning',
        })
      }

      // Count exports
      const exportCount = (content.match(/^\s*export\s+/gm) ?? []).length
      if (exportCount > 10) {
        smells.push({
          type: 'too_many_exports',
          file,
          detail: `File has ${exportCount} exports (threshold: 10)`,
          severity: 'warning',
        })
      }

      // Long functions (>50 lines) and functions with >5 params
      const funcRe =
        /(?:(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\))|(?:(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\))/g
      let match: RegExpExecArray | null

      while ((match = funcRe.exec(content)) !== null) {
        const funcName = match[1] ?? match[3] ?? 'anonymous'
        const paramStr = match[2] ?? match[4] ?? ''
        const params = paramStr
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p.length > 0)

        if (params.length > 5) {
          const lineNum = content.slice(0, match.index).split('\n').length
          smells.push({
            type: 'too_many_params',
            file,
            detail: `Function "${funcName}" at line ${lineNum} has ${params.length} params (threshold: 5)`,
            severity: 'warning',
          })
        }

        // Measure function body length
        const startIdx = match.index
        let depth = 0
        let bodyEnd = startIdx
        let foundOpen = false
        for (let i = startIdx; i < content.length; i++) {
          if (content[i] === '{') { depth++; foundOpen = true }
          else if (content[i] === '}') {
            depth--
            if (foundOpen && depth === 0) { bodyEnd = i; break }
          }
        }
        const body = content.slice(startIdx, bodyEnd + 1)
        const funcLines = body.split('\n').length

        if (funcLines > 50) {
          const lineNum = content.slice(0, startIdx).split('\n').length
          smells.push({
            type: 'long_method',
            file,
            detail: `Function "${funcName}" at line ${lineNum} has ${funcLines} lines (threshold: 50)`,
            severity: funcLines > 100 ? 'error' : 'warning',
          })
        }
      }
    } catch { /* skip unreadable files */ }
  }

  return smells
}

// ─── find_duplicates ──────────────────────────────────────────────────────────

interface DuplicateBlock {
  files: string[]
  startLines: number[]
  lineCount: number
  preview: string
}

function normalizeBlock(lines: string[]): string {
  return lines.map((l) => l.trim()).join('\n')
}

function findDuplicates(directory: string, minLines: number): DuplicateBlock[] {
  const files = walkDir(resolve(process.cwd(), directory))
  const blockMap = new Map<string, { file: string; startLine: number }[]>()

  for (const file of files) {
    try {
      const lines = readFileSync(file, 'utf-8').split('\n')
      for (let i = 0; i <= lines.length - minLines; i++) {
        const block = normalizeBlock(lines.slice(i, i + minLines))
        // Skip blocks that are mostly blank lines or comments
        const nonBlank = block.split('\n').filter((l) => l.length > 2).length
        if (nonBlank < Math.ceil(minLines * 0.6)) continue

        const existing = blockMap.get(block) ?? []
        // Only add if not from same file at same position
        const alreadyHere = existing.some((e) => e.file === file && Math.abs(e.startLine - (i + 1)) < minLines)
        if (!alreadyHere) {
          existing.push({ file, startLine: i + 1 })
          blockMap.set(block, existing)
        }
      }
    } catch { /* skip */ }
  }

  const duplicates: DuplicateBlock[] = []
  for (const [block, locations] of blockMap) {
    if (locations.length >= 2) {
      duplicates.push({
        files: locations.map((l) => l.file),
        startLines: locations.map((l) => l.startLine),
        lineCount: minLines,
        preview: block.split('\n').slice(0, 3).join('\n'),
      })
    }
  }

  return duplicates
}

// ─── find_circular_deps ───────────────────────────────────────────────────────

interface CircularDep {
  cycle: string[]
}

function extractImports(filePath: string): string[] {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const imports: string[] = []
    const importRe = /(?:import|require)\s*(?:\([^)]+\)|['"]([^'"]+)['"]|.*?from\s+['"]([^'"]+)['"])/g
    let m: RegExpExecArray | null
    while ((m = importRe.exec(content)) !== null) {
      const imp = m[1] ?? m[2]
      if (imp && (imp.startsWith('./') || imp.startsWith('../'))) {
        imports.push(imp)
      }
    }
    return imports
  } catch {
    return []
  }
}

function resolveImport(fromFile: string, imp: string): string {
  const dir = join(fromFile, '..')
  const base = resolve(dir, imp)
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']
  for (const ext of extensions) {
    try {
      statSync(base + ext)
      return base + ext
    } catch { /* try next */ }
  }
  return base
}

function buildImportGraph(
  file: string,
  graph: Map<string, string[]>,
  visited: Set<string>
): void {
  if (visited.has(file)) return
  visited.add(file)

  const imports = extractImports(file)
  const resolved = imports.map((i) => resolveImport(file, i))
  graph.set(file, resolved)

  for (const dep of resolved) {
    buildImportGraph(dep, graph, visited)
  }
}

function findCycles(graph: Map<string, string[]>): CircularDep[] {
  const cycles: CircularDep[] = []
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const stack: string[] = []

  function dfs(node: string): void {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node)
      if (cycleStart !== -1) {
        cycles.push({ cycle: [...stack.slice(cycleStart), node] })
      }
      return
    }
    if (visited.has(node)) return

    visited.add(node)
    inStack.add(node)
    stack.push(node)

    for (const dep of graph.get(node) ?? []) {
      dfs(dep)
    }

    stack.pop()
    inStack.delete(node)
  }

  for (const node of graph.keys()) {
    dfs(node)
  }

  return cycles
}

// ─── get_quality_score ────────────────────────────────────────────────────────

function computeQualityScore(
  fileCount: number,
  smells: CodeSmell[],
  duplicates: DuplicateBlock[],
  cycles: CircularDep[],
  avgComplexity: number
): number {
  let score = 100

  // Deduct for smells
  const errors = smells.filter((s) => s.severity === 'error').length
  const warnings = smells.filter((s) => s.severity === 'warning').length
  score -= errors * 5
  score -= warnings * 2

  // Deduct for duplicates (normalized by file count)
  const dupRatio = fileCount > 0 ? duplicates.length / fileCount : 0
  score -= Math.min(20, Math.round(dupRatio * 40))

  // Deduct for circular deps
  score -= cycles.length * 10

  // Deduct for high complexity
  if (avgComplexity > 15) score -= 20
  else if (avgComplexity > 10) score -= 10
  else if (avgComplexity > 7) score -= 5

  return Math.max(0, Math.min(100, score))
}

// ─── Request Handler ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  if (!args) throw new McpError(ErrorCode.InvalidParams, 'Missing arguments')

  switch (name) {
    case 'analyze_complexity': {
      try {
        const { filePath } = args as { filePath: string }
        const functions = analyzeComplexity(filePath)
        const avgComplexity =
          functions.length > 0
            ? parseFloat(
                (functions.reduce((a, f) => a + f.complexity, 0) / functions.length).toFixed(2)
              )
            : 0

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  file: filePath,
                  functionsAnalyzed: functions.length,
                  averageComplexity: avgComplexity,
                  highComplexity: functions.filter((f) => f.level === 'high' || f.level === 'critical'),
                  functions: functions.sort((a, b) => b.complexity - a.complexity),
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    }

    case 'find_code_smells': {
      try {
        const { directory } = args as { directory: string }
        const smells = findCodeSmells(directory)
        const byType: Record<string, number> = {}
        for (const s of smells) {
          byType[s.type] = (byType[s.type] ?? 0) + 1
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalSmells: smells.length,
                  byType,
                  smells: smells.slice(0, 50),
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    }

    case 'find_duplicates': {
      try {
        const { directory, minLines = 5 } = args as { directory: string; minLines?: number }
        const duplicates = findDuplicates(directory, minLines)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalDuplicateBlocks: duplicates.length,
                  duplicates: duplicates.slice(0, 30),
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    }

    case 'find_circular_deps': {
      try {
        const { entryFile } = args as { entryFile?: string }
        const entry = resolve(
          process.cwd(),
          entryFile ?? 'src/index.ts'
        )

        const graph = new Map<string, string[]>()
        buildImportGraph(entry, graph, new Set())
        const cycles = findCycles(graph)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  filesAnalyzed: graph.size,
                  circularDepsFound: cycles.length,
                  cycles,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    }

    case 'get_quality_score': {
      try {
        const { directory } = args as { directory: string }
        const absDir = resolve(process.cwd(), directory)
        const files = walkDir(absDir)

        const smells = findCodeSmells(directory)
        const duplicates = findDuplicates(directory, 5)

        // Try to find entry point for circular dep analysis
        const entryFile = files.find((f) => f.endsWith('index.ts') || f.endsWith('index.js'))
        let cycles: CircularDep[] = []
        if (entryFile) {
          const graph = new Map<string, string[]>()
          buildImportGraph(entryFile, graph, new Set())
          cycles = findCycles(graph)
        }

        // Complexity sampling (first 10 files for performance)
        let totalComplexity = 0
        let funcCount = 0
        for (const file of files.slice(0, 10)) {
          try {
            const funcs = analyzeComplexity(file)
            for (const f of funcs) {
              totalComplexity += f.complexity
              funcCount++
            }
          } catch { /* skip */ }
        }
        const avgComplexity = funcCount > 0 ? totalComplexity / funcCount : 0

        const score = computeQualityScore(files.length, smells, duplicates, cycles, avgComplexity)

        const grade =
          score >= 90 ? 'A' :
          score >= 80 ? 'B' :
          score >= 70 ? 'C' :
          score >= 60 ? 'D' : 'F'

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  directory,
                  qualityScore: score,
                  grade,
                  breakdown: {
                    filesAnalyzed: files.length,
                    codeSmells: smells.length,
                    duplicateBlocks: duplicates.length,
                    circularDeps: cycles.length,
                    averageComplexity: parseFloat(avgComplexity.toFixed(2)),
                  },
                  topIssues: smells.slice(0, 10).map((s) => `[${s.type}] ${s.detail}`),
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${(err as Error).message}` }],
          isError: true,
        }
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
