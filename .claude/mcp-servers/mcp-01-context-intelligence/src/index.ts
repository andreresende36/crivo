import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { DatabaseSync } from 'node:sqlite'
import fs from 'fs'
import path from 'path'

// ──────────────────────────────────────────────────────────────
// Database setup
// ──────────────────────────────────────────────────────────────

function getDb(): DatabaseSync {
  const dbDir = path.join(process.cwd(), '.claude')
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(path.join(dbDir, 'context.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS observations (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol    TEXT NOT NULL,
      file_path TEXT,
      note      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_obs_symbol ON observations(symbol);
  `)
  return db
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function readFileSafe(filePath: string): string {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath)
  if (!fs.existsSync(resolved)) throw new Error(`File not found: ${resolved}`)
  return fs.readFileSync(resolved, 'utf-8')
}

function extractSymbol(
  source: string,
  symbolName: string
): { code: string; lineStart: number; lineEnd: number } | null {
  const lines = source.split('\n')
  // Match function, class, const/let/var declarations
  const patterns = [
    new RegExp(`^\\s*(export\\s+)?(async\\s+)?function\\s+${symbolName}\\b`),
    new RegExp(`^\\s*(export\\s+)?(abstract\\s+)?class\\s+${symbolName}\\b`),
    new RegExp(`^\\s*(export\\s+)?(const|let|var)\\s+${symbolName}\\s*=`),
    new RegExp(`^\\s*(export\\s+)?type\\s+${symbolName}\\s*=`),
    new RegExp(`^\\s*(export\\s+)?interface\\s+${symbolName}\\b`),
  ]

  let startLine = -1
  for (let i = 0; i < lines.length; i++) {
    if (patterns.some((p) => p.test(lines[i]))) {
      startLine = i
      break
    }
  }
  if (startLine === -1) return null

  // Find end by tracking braces / checking indentation
  let braceDepth = 0
  let endLine = startLine
  let started = false
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') { braceDepth++; started = true }
      if (ch === '}') braceDepth--
    }
    if (started && braceDepth === 0) { endLine = i; break }
    if (!started && i > startLine && lines[i].trim() === '') { endLine = i - 1; break }
  }

  const code = lines.slice(startLine, endLine + 1).join('\n')
  return { code, lineStart: startLine + 1, lineEnd: endLine + 1 }
}

function walkDir(
  dir: string,
  extensions: string[] = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs']
): string[] {
  const results: string[] = []
  const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__'])
  function walk(current: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (ignored.has(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (extensions.includes(path.extname(entry.name))) results.push(full)
    }
  }
  walk(dir)
  return results
}

// ──────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-context-intelligence', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_symbol_context',
      description:
        'Reads a source file, finds a symbol (function/class/variable/type), and returns its code, location, and any saved observations.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          filePath: { type: 'string', description: 'Path to the source file (absolute or relative to cwd)' },
          symbolName: { type: 'string', description: 'Name of the function, class, variable, or type to locate' },
        },
        required: ['filePath', 'symbolName'],
      },
    },
    {
      name: 'add_observation',
      description: 'Saves a note/observation about a symbol to the local SQLite context database.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          symbol: { type: 'string', description: 'Symbol name the observation is about' },
          note: { type: 'string', description: 'The observation or note to save' },
          filePath: { type: 'string', description: 'Optional: file path where the symbol lives' },
        },
        required: ['symbol', 'note'],
      },
    },
    {
      name: 'get_project_summary',
      description: 'Walks the project directory, counts files by extension, finds CLAUDE.md / README.md, returns a project overview.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          rootDir: { type: 'string', description: 'Root directory to scan (defaults to cwd)' },
        },
        required: [],
      },
    },
    {
      name: 'find_dependents',
      description: 'Finds all source files that import or reference a given symbol name.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          symbolName: { type: 'string', description: 'Symbol name to search for' },
          rootDir: { type: 'string', description: 'Root directory to search in (defaults to cwd)' },
        },
        required: ['symbolName'],
      },
    },
    {
      name: 'search_symbols',
      description: 'Greps across the project for function/class/const declarations matching a query string.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search term to match against symbol names' },
          rootDir: { type: 'string', description: 'Root directory (defaults to cwd)' },
          fileExtensions: {
            type: 'array',
            items: { type: 'string' },
            description: 'File extensions to search (e.g. [".ts", ".js"]). Defaults to common source types.',
          },
        },
        required: ['query'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    // ── get_symbol_context ──────────────────────────────────────
    case 'get_symbol_context': {
      const { filePath, symbolName } = args as { filePath: string; symbolName: string }
      try {
        const source = readFileSafe(filePath)
        const extracted = extractSymbol(source, symbolName)
        if (!extracted) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ found: false, symbol: symbolName, filePath, message: 'Symbol not found in file.' }, null, 2),
              },
            ],
          }
        }

        const db = getDb()
        const observations = db
          .prepare('SELECT note, created_at FROM observations WHERE symbol = ? ORDER BY created_at DESC')
          .all(symbolName) as { note: string; created_at: string }[]

        const result = {
          found: true,
          symbol: symbolName,
          filePath: path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath),
          lineStart: extracted.lineStart,
          lineEnd: extracted.lineEnd,
          code: extracted.code,
          observations,
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `get_symbol_context failed: ${(err as Error).message}`)
      }
    }

    // ── add_observation ─────────────────────────────────────────
    case 'add_observation': {
      const { symbol, note, filePath } = args as { symbol: string; note: string; filePath?: string }
      try {
        const db = getDb()
        const stmt = db.prepare(
          'INSERT INTO observations (symbol, file_path, note) VALUES (?, ?, ?)'
        )
        const info = stmt.run(symbol, filePath ?? null, note)
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ saved: true, id: info.lastInsertRowid, symbol, note }, null, 2),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `add_observation failed: ${(err as Error).message}`)
      }
    }

    // ── get_project_summary ─────────────────────────────────────
    case 'get_project_summary': {
      const { rootDir } = args as { rootDir?: string }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        const allFiles = walkDir(root, [
          '.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.cs', '.rb',
          '.md', '.json', '.yml', '.yaml', '.toml', '.env',
        ])

        const byExt: Record<string, number> = {}
        for (const f of allFiles) {
          const ext = path.extname(f) || '(no ext)'
          byExt[ext] = (byExt[ext] ?? 0) + 1
        }

        // Find CLAUDE.md / README.md
        let claudeMd = ''
        let readmeMd = ''
        const claudePath = path.join(root, 'CLAUDE.md')
        const readmePath = path.join(root, 'README.md')
        if (fs.existsSync(claudePath)) claudeMd = fs.readFileSync(claudePath, 'utf-8').slice(0, 2000)
        if (fs.existsSync(readmePath)) readmeMd = fs.readFileSync(readmePath, 'utf-8').slice(0, 2000)

        // Detect package managers
        const packageJson = path.join(root, 'package.json')
        let packageInfo: Record<string, unknown> = {}
        if (fs.existsSync(packageJson)) {
          try { packageInfo = JSON.parse(fs.readFileSync(packageJson, 'utf-8')) } catch { /* ignore */ }
        }

        const result = {
          root,
          totalFiles: allFiles.length,
          filesByExtension: byExt,
          hasClaudeMd: fs.existsSync(claudePath),
          claudeMdPreview: claudeMd,
          hasReadme: fs.existsSync(readmePath),
          readmePreview: readmeMd,
          packageName: packageInfo.name ?? null,
          packageVersion: packageInfo.version ?? null,
          dependencies: Object.keys((packageInfo.dependencies as Record<string, string> | undefined) ?? {}),
          devDependencies: Object.keys((packageInfo.devDependencies as Record<string, string> | undefined) ?? {}),
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `get_project_summary failed: ${(err as Error).message}`)
      }
    }

    // ── find_dependents ─────────────────────────────────────────
    case 'find_dependents': {
      const { symbolName, rootDir } = args as { symbolName: string; rootDir?: string }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        const files = walkDir(root)
        const dependents: { file: string; lines: number[] }[] = []

        for (const file of files) {
          let content: string
          try { content = fs.readFileSync(file, 'utf-8') } catch { continue }
          const lines = content.split('\n')
          const matchedLines: number[] = []
          lines.forEach((line, idx) => {
            if (
              line.includes(`import`) && line.includes(symbolName) ||
              new RegExp(`\\b${symbolName}\\b`).test(line)
            ) {
              matchedLines.push(idx + 1)
            }
          })
          if (matchedLines.length > 0) {
            dependents.push({ file: path.relative(root, file), lines: matchedLines })
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ symbol: symbolName, dependents, total: dependents.length }, null, 2),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `find_dependents failed: ${(err as Error).message}`)
      }
    }

    // ── search_symbols ───────────────────────────────────────────
    case 'search_symbols': {
      const { query, rootDir, fileExtensions } = args as {
        query: string
        rootDir?: string
        fileExtensions?: string[]
      }
      try {
        const root = rootDir ? path.resolve(rootDir) : process.cwd()
        const exts = fileExtensions ?? ['.ts', '.tsx', '.js', '.jsx']
        const files = walkDir(root, exts)

        const declarationPattern = new RegExp(
          `(export\\s+)?(async\\s+)?function\\s+(\\w*${query}\\w*)|(export\\s+)?(abstract\\s+)?class\\s+(\\w*${query}\\w*)|(export\\s+)?(const|let|var)\\s+(\\w*${query}\\w*)\\s*=|(export\\s+)?type\\s+(\\w*${query}\\w*)\\s*=|(export\\s+)?interface\\s+(\\w*${query}\\w*)\\b`,
          'i'
        )

        const matches: { file: string; line: number; lineContent: string; symbolName: string }[] = []

        for (const file of files) {
          let content: string
          try { content = fs.readFileSync(file, 'utf-8') } catch { continue }
          const lines = content.split('\n')
          lines.forEach((lineContent, idx) => {
            const m = declarationPattern.exec(lineContent)
            if (m) {
              const symbolName = (m[3] ?? m[6] ?? m[9] ?? m[11] ?? m[13] ?? '').trim()
              if (symbolName) {
                matches.push({ file: path.relative(root, file), line: idx + 1, lineContent: lineContent.trim(), symbolName })
              }
            }
          })
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ query, total: matches.length, matches }, null, 2),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `search_symbols failed: ${(err as Error).message}`)
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
