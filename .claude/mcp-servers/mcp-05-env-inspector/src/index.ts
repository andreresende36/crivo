import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import * as dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function maskValue(value: string): string {
  if (!value || value.length === 0) return ''
  if (value.length <= 3) return '***'
  return value.slice(0, 3) + '*'.repeat(Math.min(value.length - 3, 12))
}

interface EnvFile {
  filename: string
  filePath: string
  exists: boolean
  vars: Record<string, string>
}

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = dotenv.parse(raw)
    return parsed
  } catch {
    return {}
  }
}

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.development', '.env.production', '.env.staging', '.env.test', '.env.example']

function loadAllEnvFiles(rootDir: string): EnvFile[] {
  return ENV_FILE_NAMES.map((filename) => {
    const filePath = path.join(rootDir, filename)
    const exists = fs.existsSync(filePath)
    return {
      filename,
      filePath,
      exists,
      vars: exists ? readEnvFile(filePath) : {},
    }
  }).filter((f) => f.exists)
}

// Pattern to find process.env.VAR_NAME and import.meta.env.VAR_NAME
const ENV_USAGE_PATTERN = /(?:process\.env|import\.meta\.env)\.([A-Z_][A-Z0-9_]*)/g

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte']
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.nuxt', '.output'])

function walkSourceFiles(rootDir: string): string[] {
  const results: string[] = []
  function walk(dir: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) results.push(full)
    }
  }
  walk(rootDir)
  return results
}

function scanEnvUsages(rootDir: string): Map<string, string[]> {
  const usages = new Map<string, string[]>() // varName → [files]
  const sourceFiles = walkSourceFiles(rootDir)

  for (const file of sourceFiles) {
    let content: string
    try { content = fs.readFileSync(file, 'utf-8') } catch { continue }
    const relativePath = path.relative(rootDir, file)
    let match: RegExpExecArray | null
    ENV_USAGE_PATTERN.lastIndex = 0
    while ((match = ENV_USAGE_PATTERN.exec(content)) !== null) {
      const varName = match[1]
      if (!usages.has(varName)) usages.set(varName, [])
      const files = usages.get(varName)!
      if (!files.includes(relativePath)) files.push(relativePath)
    }
  }

  return usages
}

// ──────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-env-inspector', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_env_vars',
      description: 'Reads all .env files and returns their variables with values masked (first 3 chars + ***).',
      inputSchema: {
        type: 'object' as const,
        properties: {
          rootDir: { type: 'string', description: 'Project root directory (defaults to cwd)' },
          unmask: { type: 'boolean', description: 'If true, shows full values (use with caution!)' },
        },
        required: [],
      },
    },
    {
      name: 'check_missing_vars',
      description:
        'Scans source files for process.env.* and import.meta.env.* usages, then checks which variables are NOT defined in .env files.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          rootDir: { type: 'string', description: 'Project root directory (defaults to cwd)' },
        },
        required: [],
      },
    },
    {
      name: 'compare_environments',
      description: 'Compares environment variable keys across .env, .env.production, .env.staging, etc. to find mismatches.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          rootDir: { type: 'string', description: 'Project root directory (defaults to cwd)' },
        },
        required: [],
      },
    },
    {
      name: 'validate_configuration',
      description:
        'Checks required env variables against what is actually defined. Reads REQUIRED_ENV list from CLAUDE.md or a dedicated config.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          rootDir: { type: 'string', description: 'Project root directory (defaults to cwd)' },
          requiredVars: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional explicit list of required variable names. If provided, overrides auto-detection.',
          },
        },
        required: [],
      },
    },
    {
      name: 'generate_env_example',
      description:
        'Scans source files for all process.env.* usage and generates a .env.example file with empty values and inline comments.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          rootDir: { type: 'string', description: 'Project root directory (defaults to cwd)' },
          write: { type: 'boolean', description: 'If true, writes the generated content to .env.example (default: false — just returns content)' },
        },
        required: [],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    // ── list_env_vars ───────────────────────────────────────────
    case 'list_env_vars': {
      const { rootDir, unmask = false } = args as { rootDir?: string; unmask?: boolean }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        const envFiles = loadAllEnvFiles(root)

        const result = envFiles.map((file) => ({
          filename: file.filename,
          varCount: Object.keys(file.vars).length,
          vars: Object.fromEntries(
            Object.entries(file.vars).map(([k, v]) => [k, unmask ? v : maskValue(v)])
          ),
        }))

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  rootDir: root,
                  totalFiles: result.length,
                  files: result,
                  note: unmask ? 'Values shown in full.' : 'Values masked for security.',
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `list_env_vars failed: ${(err as Error).message}`)
      }
    }

    // ── check_missing_vars ──────────────────────────────────────
    case 'check_missing_vars': {
      const { rootDir } = args as { rootDir?: string }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        const envFiles = loadAllEnvFiles(root)
        const usages = scanEnvUsages(root)

        // Collect all defined vars (from all .env files combined)
        const definedVars = new Set<string>()
        for (const file of envFiles) {
          Object.keys(file.vars).forEach((k) => definedVars.add(k))
        }

        // Also include current process.env
        Object.keys(process.env).forEach((k) => definedVars.add(k))

        const missing: { varName: string; usedIn: string[] }[] = []
        const defined: { varName: string; usedIn: string[]; definedIn: string[] }[] = []

        for (const [varName, files] of usages.entries()) {
          if (!definedVars.has(varName)) {
            missing.push({ varName, usedIn: files })
          } else {
            const definedIn = envFiles
              .filter((f) => Object.prototype.hasOwnProperty.call(f.vars, varName))
              .map((f) => f.filename)
            defined.push({ varName, usedIn: files, definedIn })
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  rootDir: root,
                  totalUsed: usages.size,
                  missingCount: missing.length,
                  definedCount: defined.length,
                  missing,
                  defined,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `check_missing_vars failed: ${(err as Error).message}`)
      }
    }

    // ── compare_environments ────────────────────────────────────
    case 'compare_environments': {
      const { rootDir } = args as { rootDir?: string }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        const envFiles = loadAllEnvFiles(root)

        if (envFiles.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ message: 'No .env files found in the project root.' }, null, 2),
              },
            ],
          }
        }

        // Get union of all keys
        const allKeys = new Set<string>()
        for (const file of envFiles) {
          Object.keys(file.vars).forEach((k) => allKeys.add(k))
        }

        // Build comparison matrix
        const matrix: Record<string, Record<string, 'defined' | 'missing'>> = {}
        for (const key of allKeys) {
          matrix[key] = {}
          for (const file of envFiles) {
            matrix[key][file.filename] = Object.prototype.hasOwnProperty.call(file.vars, key) ? 'defined' : 'missing'
          }
        }

        // Find vars that are missing in some envs
        const inconsistent = Object.entries(matrix)
          .filter(([, fileMap]) => Object.values(fileMap).includes('missing'))
          .map(([varName, fileMap]) => ({ varName, status: fileMap }))

        const consistent = Object.keys(matrix).length - inconsistent.length

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  rootDir: root,
                  filesCompared: envFiles.map((f) => f.filename),
                  totalVars: allKeys.size,
                  consistentVars: consistent,
                  inconsistentVars: inconsistent.length,
                  inconsistencies: inconsistent,
                  matrix,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `compare_environments failed: ${(err as Error).message}`)
      }
    }

    // ── validate_configuration ──────────────────────────────────
    case 'validate_configuration': {
      const { rootDir, requiredVars } = args as { rootDir?: string; requiredVars?: string[] }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        let required: string[] = requiredVars ?? []

        // If not provided, try to extract from CLAUDE.md
        if (required.length === 0) {
          const claudePath = path.join(root, 'CLAUDE.md')
          if (fs.existsSync(claudePath)) {
            const claudeContent = fs.readFileSync(claudePath, 'utf-8')
            // Look for REQUIRED_ENV or ## Environment Variables sections
            const reqEnvMatch = claudeContent.match(/REQUIRED_ENV[:\s]*\[([^\]]+)\]/s)
            if (reqEnvMatch) {
              required = reqEnvMatch[1]
                .split(/[\n,]/)
                .map((s) => s.replace(/[`'"]/g, '').trim())
                .filter((s) => /^[A-Z_][A-Z0-9_]*$/.test(s))
            }

            if (required.length === 0) {
              // Try to extract env var names from code blocks in CLAUDE.md
              const envBlockMatch = claudeContent.match(/```(?:env|dotenv|bash)?\n([\s\S]*?)```/g)
              if (envBlockMatch) {
                for (const block of envBlockMatch) {
                  const lines = block.split('\n')
                  for (const line of lines) {
                    const m = line.match(/^([A-Z_][A-Z0-9_]*)=/)
                    if (m) required.push(m[1])
                  }
                }
              }
            }
          }
        }

        // Also check for a .env.example as the source of truth
        if (required.length === 0) {
          const examplePath = path.join(root, '.env.example')
          if (fs.existsSync(examplePath)) {
            const exampleVars = readEnvFile(examplePath)
            required = Object.keys(exampleVars)
          }
        }

        // Fallback: scan for env usages in source
        if (required.length === 0) {
          const usages = scanEnvUsages(root)
          required = Array.from(usages.keys())
        }

        // Load all defined vars
        const envFiles = loadAllEnvFiles(root)
        const definedVars = new Set<string>()
        for (const file of envFiles) {
          Object.keys(file.vars).forEach((k) => definedVars.add(k))
        }
        Object.keys(process.env).forEach((k) => definedVars.add(k))

        const results = required.map((varName) => ({
          varName,
          defined: definedVars.has(varName),
          definedIn: envFiles
            .filter((f) => Object.prototype.hasOwnProperty.call(f.vars, varName))
            .map((f) => f.filename),
        }))

        const missingVars = results.filter((r) => !r.defined)
        const status = missingVars.length === 0 ? 'PASS' : 'FAIL'

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  rootDir: root,
                  status,
                  requiredCount: required.length,
                  missingCount: missingVars.length,
                  missing: missingVars.map((r) => r.varName),
                  results,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `validate_configuration failed: ${(err as Error).message}`)
      }
    }

    // ── generate_env_example ────────────────────────────────────
    case 'generate_env_example': {
      const { rootDir, write = false } = args as { rootDir?: string; write?: boolean }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        const usages = scanEnvUsages(root)

        // Load existing .env for context (which ones have values)
        const existingEnv = readEnvFile(path.join(root, '.env'))
        const existingExample = readEnvFile(path.join(root, '.env.example'))

        const lines: string[] = [
          '# Auto-generated by mcp-env-inspector',
          `# Generated: ${new Date().toISOString()}`,
          '# Fill in the values for your environment',
          '',
        ]

        // Group vars by first part of name (e.g. DATABASE_, NEXT_PUBLIC_, etc.)
        const grouped = new Map<string, string[]>()
        for (const varName of Array.from(usages.keys()).sort()) {
          const prefix = varName.split('_')[0] ?? 'MISC'
          if (!grouped.has(prefix)) grouped.set(prefix, [])
          grouped.get(prefix)!.push(varName)
        }

        for (const [prefix, vars] of grouped.entries()) {
          lines.push(`# ── ${prefix} ──`)
          for (const varName of vars) {
            const usedIn = usages.get(varName) ?? []
            const comment = `# Used in: ${usedIn.slice(0, 3).join(', ')}${usedIn.length > 3 ? ` +${usedIn.length - 3} more` : ''}`
            lines.push(comment)

            // If already in .env.example, use that value hint
            const exampleVal = existingExample[varName]
            const envVal = existingEnv[varName]
            const valueHint = exampleVal ?? (envVal ? maskValue(envVal) : '')
            lines.push(`${varName}=${valueHint}`)
          }
          lines.push('')
        }

        const content = lines.join('\n')

        if (write) {
          fs.writeFileSync(path.join(root, '.env.example'), content, 'utf-8')
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  rootDir: root,
                  totalVars: usages.size,
                  written: write,
                  outputPath: write ? path.join(root, '.env.example') : null,
                  content,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `generate_env_example failed: ${(err as Error).message}`)
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`)
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
