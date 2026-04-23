import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { simpleGit, type SimpleGit } from 'simple-git'
import path from 'path'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function getGit(repoPath?: string): SimpleGit {
  const cwd = repoPath ? path.resolve(repoPath) : process.cwd()
  return simpleGit(cwd)
}

interface CommitEntry {
  hash: string
  date: string
  author: string
  message: string
}

function parseLogLine(line: string): CommitEntry | null {
  // Format: hash|date|author|message
  const parts = line.split('|')
  if (parts.length < 4) return null
  return {
    hash: parts[0].trim(),
    date: parts[1].trim(),
    author: parts[2].trim(),
    message: parts.slice(3).join('|').trim(),
  }
}

// ──────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-git-intelligence', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_file_history',
      description: 'Returns the commit history for a specific file, following renames.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          filePath: { type: 'string', description: 'Path to the file (relative to repo root or absolute)' },
          limit: { type: 'number', description: 'Maximum number of commits to return (default: 10)' },
          repoPath: { type: 'string', description: 'Path to the git repository root (defaults to cwd)' },
        },
        required: ['filePath'],
      },
    },
    {
      name: 'get_commit_diff',
      description: 'Returns the full diff / changed files for a specific commit hash.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          commitHash: { type: 'string', description: 'The commit hash (full or short)' },
          repoPath: { type: 'string', description: 'Path to the git repository root (defaults to cwd)' },
        },
        required: ['commitHash'],
      },
    },
    {
      name: 'blame_line',
      description: 'Returns git blame information for a specific line in a file — who last modified it and when.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          filePath: { type: 'string', description: 'Path to the file' },
          lineNumber: { type: 'number', description: 'Line number (1-based)' },
          repoPath: { type: 'string', description: 'Path to the git repository root (defaults to cwd)' },
        },
        required: ['filePath', 'lineNumber'],
      },
    },
    {
      name: 'find_regression',
      description: 'Finds recent commits that touched a specific test file — useful for locating when a regression was introduced.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          testFile: { type: 'string', description: 'Path to the test file to inspect' },
          limit: { type: 'number', description: 'Number of commits to return (default: 20)' },
          repoPath: { type: 'string', description: 'Path to the git repository root (defaults to cwd)' },
        },
        required: ['testFile'],
      },
    },
    {
      name: 'get_recent_activity',
      description: 'Returns all commits from the last N days, with author, date, and changed files count.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          days: { type: 'number', description: 'Number of days to look back (default: 7)' },
          repoPath: { type: 'string', description: 'Path to the git repository root (defaults to cwd)' },
          author: { type: 'string', description: 'Optional: filter by author name or email' },
        },
        required: [],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    // ── get_file_history ────────────────────────────────────────
    case 'get_file_history': {
      const { filePath, limit = 10, repoPath } = args as {
        filePath: string
        limit?: number
        repoPath?: string
      }
      try {
        const git = getGit(repoPath)
        const raw = await git.raw([
          'log',
          '--follow',
          `-n${limit}`,
          '--format=%H|%ai|%an|%s',
          '--',
          filePath,
        ])

        const commits = raw
          .split('\n')
          .filter((l) => l.trim())
          .map((line) => {
            const parts = line.split('|')
            return {
              hash: parts[0] ?? '',
              date: parts[1] ?? '',
              author: parts[2] ?? '',
              message: parts.slice(3).join('|').trim(),
            }
          })

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ filePath, total: commits.length, commits }, null, 2),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `get_file_history failed: ${(err as Error).message}`)
      }
    }

    // ── get_commit_diff ─────────────────────────────────────────
    case 'get_commit_diff': {
      const { commitHash, repoPath } = args as { commitHash: string; repoPath?: string }
      try {
        const git = getGit(repoPath)
        const diff = await git.show([commitHash, '--stat'])
        const diffFull = await git.show([commitHash])

        // Extract metadata
        const lines = diffFull.split('\n')
        const commitLine = lines.find((l) => l.startsWith('commit '))
        const authorLine = lines.find((l) => l.startsWith('Author: '))
        const dateLine = lines.find((l) => l.startsWith('Date: '))
        const messageLine = lines.find((_, i, a) => i > 0 && a[i - 1].startsWith('Date:'))

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  hash: commitHash,
                  commit: commitLine?.replace('commit ', '').trim(),
                  author: authorLine?.replace('Author: ', '').trim(),
                  date: dateLine?.replace('Date:', '').trim(),
                  message: messageLine?.trim(),
                  statSummary: diff,
                  fullDiff: diffFull,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `get_commit_diff failed: ${(err as Error).message}`)
      }
    }

    // ── blame_line ──────────────────────────────────────────────
    case 'blame_line': {
      const { filePath, lineNumber, repoPath } = args as {
        filePath: string
        lineNumber: number
        repoPath?: string
      }
      try {
        const git = getGit(repoPath)
        const raw = await git.raw(['blame', '-L', `${lineNumber},${lineNumber}`, '--porcelain', filePath])
        const lines = raw.split('\n')

        const hashLine = lines[0] ?? ''
        const hash = hashLine.split(' ')[0]
        const authorLine = lines.find((l) => l.startsWith('author '))
        const authorMailLine = lines.find((l) => l.startsWith('author-mail '))
        const authorTimeLine = lines.find((l) => l.startsWith('author-time '))
        const summaryLine = lines.find((l) => l.startsWith('summary '))
        const contentLine = lines.find((l) => l.startsWith('\t'))

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  filePath,
                  lineNumber,
                  hash,
                  author: authorLine?.replace('author ', '').trim(),
                  email: authorMailLine?.replace('author-mail ', '').trim(),
                  timestamp: authorTimeLine
                    ? new Date(parseInt(authorTimeLine.replace('author-time ', '').trim()) * 1000).toISOString()
                    : null,
                  commitMessage: summaryLine?.replace('summary ', '').trim(),
                  lineContent: contentLine?.replace('\t', '').trim(),
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `blame_line failed: ${(err as Error).message}`)
      }
    }

    // ── find_regression ─────────────────────────────────────────
    case 'find_regression': {
      const { testFile, limit = 20, repoPath } = args as {
        testFile: string
        limit?: number
        repoPath?: string
      }
      try {
        const git = getGit(repoPath)
        const raw = await git.raw([
          'log',
          '--all',
          `-n${limit}`,
          '--format=%H|%ai|%an|%s',
          '--',
          testFile,
        ])

        const commits = raw
          .split('\n')
          .filter((l) => l.trim())
          .map((line) => {
            const parts = line.split('|')
            const fullHash = parts[0] ?? ''
            return {
              hash: fullHash.slice(0, 8),
              fullHash,
              date: parts[1] ?? '',
              author: parts[2] ?? '',
              message: parts.slice(3).join('|').trim(),
            }
          })

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  testFile,
                  note: 'These are the commits that last modified this test file. Review in reverse to find regression.',
                  total: commits.length,
                  commits,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `find_regression failed: ${(err as Error).message}`)
      }
    }

    // ── get_recent_activity ──────────────────────────────────────
    case 'get_recent_activity': {
      const { days = 7, repoPath, author } = args as {
        days?: number
        repoPath?: string
        author?: string
      }
      try {
        const git = getGit(repoPath)
        const since = `${days} days ago`
        const options: Record<string, string | null> = {
          '--since': since,
          '--oneline': null,
          '--stat': null,
        }
        if (author) options['--author'] = author

        const raw = await git.raw([
          'log',
          `--since=${since}`,
          '--format=%H|%ai|%an|%ae|%s',
          ...(author ? [`--author=${author}`] : []),
        ])

        const commits = raw
          .split('\n')
          .filter((l) => l.trim())
          .map((line) => {
            const parts = line.split('|')
            return {
              hash: (parts[0] ?? '').slice(0, 8),
              fullHash: parts[0] ?? '',
              date: parts[1] ?? '',
              author: parts[2] ?? '',
              email: parts[3] ?? '',
              message: parts.slice(4).join('|').trim(),
            }
          })

        // Get diff stats for each commit
        const withStats = await Promise.all(
          commits.slice(0, 50).map(async (c) => {
            try {
              const stat = await git.raw(['show', '--stat', '--format=', c.fullHash])
              const statsLine = stat.split('\n').filter((l) => l.includes('changed')).at(-1)?.trim()
              return { ...c, stats: statsLine ?? '' }
            } catch {
              return { ...c, stats: '' }
            }
          })
        )

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ days, total: commits.length, commits: withStats }, null, 2),
            },
          ],
        }
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `get_recent_activity failed: ${(err as Error).message}`)
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
