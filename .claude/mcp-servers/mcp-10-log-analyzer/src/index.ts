import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const server = new Server(
  { name: 'mcp-log-analyzer', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_logs',
      description:
        'Reads a log file (last N lines) and returns lines matching a regex query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Regex pattern to filter log lines.' },
          logPath: { type: 'string', description: 'Path to log file.' },
          lines: { type: 'number', default: 100, description: 'How many lines from the end to read.' },
        },
        required: ['query', 'logPath'],
      },
    },
    {
      name: 'correlate_request',
      description:
        'Searches all log files in a directory for lines containing a given correlation/request ID.',
      inputSchema: {
        type: 'object',
        properties: {
          correlationId: { type: 'string', description: 'The request or correlation ID to find.' },
          logPath: {
            type: 'string',
            description: 'Directory (searches all *.log files) or single log file path.',
          },
        },
        required: ['correlationId', 'logPath'],
      },
    },
    {
      name: 'find_error_patterns',
      description:
        'Analyzes a log file for ERROR/WARN lines, groups by message pattern (strips dynamic IDs), returns counts sorted by frequency.',
      inputSchema: {
        type: 'object',
        properties: {
          logPath: { type: 'string', description: 'Path to log file.' },
          timeRange: {
            type: 'object',
            description: 'Optional time range filter.',
            properties: {
              start: { type: 'string', description: 'ISO date string for range start.' },
              end: { type: 'string', description: 'ISO date string for range end.' },
            },
          },
        },
        required: ['logPath'],
      },
    },
    {
      name: 'analyze_anomaly',
      description:
        'Looks for unusual spikes in error rate or response latency within a log file.',
      inputSchema: {
        type: 'object',
        properties: {
          logPath: { type: 'string', description: 'Path to log file.' },
          metric: {
            type: 'string',
            enum: ['error_rate', 'latency'],
            default: 'error_rate',
            description: '"error_rate" or "latency".',
          },
          windowMinutes: {
            type: 'number',
            default: 5,
            description: 'Time window in minutes for bucketing.',
          },
        },
        required: ['logPath'],
      },
    },
    {
      name: 'tail_logs',
      description: 'Returns the last N lines from a log file.',
      inputSchema: {
        type: 'object',
        properties: {
          logPath: { type: 'string', description: 'Path to log file.' },
          lines: { type: 'number', default: 50, description: 'Number of lines to return.' },
        },
        required: ['logPath'],
      },
    },
  ],
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readLastNLines(filePath: string, n: number): string[] {
  const content = readFileSync(filePath, 'utf-8')
  const lines = content.split('\n').filter(Boolean)
  return lines.slice(Math.max(0, lines.length - n))
}

function readAllLines(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8')
  return content.split('\n').filter(Boolean)
}

function walkLogFiles(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      try {
        const stat = statSync(full)
        if (stat.isDirectory()) {
          results.push(...walkLogFiles(full))
        } else if (entry.endsWith('.log') || entry.endsWith('.txt') || entry.endsWith('.out')) {
          results.push(full)
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results
}

/**
 * Strips dynamic parts from log messages to group similar errors:
 * - UUIDs
 * - numeric IDs
 * - timestamps
 * - hex strings
 * - IP addresses
 */
function normalizeLogMessage(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, '<TIMESTAMP>')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<IP>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<HEX>')
    .replace(/\b\d{5,}\b/g, '<ID>')
    .replace(/\b\d{1,4}\b/g, '<NUM>')
    .trim()
}

function extractTimestamp(line: string): Date | null {
  const iso = line.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/)
  if (iso) return new Date(iso[0])
  const epoch = line.match(/\b(\d{10,13})\b/)
  if (epoch) {
    const n = parseInt(epoch[1], 10)
    return new Date(n < 1e12 ? n * 1000 : n)
  }
  return null
}

function extractLatency(line: string): number | null {
  const ms = line.match(/\b(\d+(?:\.\d+)?)\s*ms\b/)
  if (ms) return parseFloat(ms[1])
  const duration = line.match(/duration[=: ]+(\d+(?:\.\d+)?)/i)
  if (duration) return parseFloat(duration[1])
  return null
}

// ─── Request Handler ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  if (!args) throw new McpError(ErrorCode.InvalidParams, 'Missing arguments')

  switch (name) {
    // ── search_logs ────────────────────────────────────────────────────────────
    case 'search_logs': {
      try {
        const { query, logPath, lines = 100 } = args as {
          query: string
          logPath: string
          lines?: number
        }
        const absPath = resolve(process.cwd(), logPath)
        if (!existsSync(absPath)) {
          return { content: [{ type: 'text', text: `File not found: ${absPath}` }], isError: true }
        }

        const allLines = readLastNLines(absPath, lines)
        let re: RegExp
        try {
          re = new RegExp(query, 'i')
        } catch {
          return { content: [{ type: 'text', text: `Invalid regex: ${query}` }], isError: true }
        }

        const matches = allLines.filter((l) => re.test(l))

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  query,
                  linesScanned: allLines.length,
                  matchesFound: matches.length,
                  matches,
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

    // ── correlate_request ──────────────────────────────────────────────────────
    case 'correlate_request': {
      try {
        const { correlationId, logPath } = args as { correlationId: string; logPath: string }
        const absPath = resolve(process.cwd(), logPath)

        let logFiles: string[] = []
        try {
          const stat = statSync(absPath)
          if (stat.isDirectory()) {
            logFiles = walkLogFiles(absPath)
          } else {
            logFiles = [absPath]
          }
        } catch {
          return { content: [{ type: 'text', text: `Path not found: ${absPath}` }], isError: true }
        }

        const results: { file: string; line: number; content: string }[] = []

        for (const file of logFiles) {
          try {
            const lines = readAllLines(file)
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].includes(correlationId)) {
                results.push({ file, line: i + 1, content: lines[i] })
              }
            }
          } catch { /* skip unreadable */ }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  correlationId,
                  filesSearched: logFiles.length,
                  occurrences: results.length,
                  results,
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

    // ── find_error_patterns ────────────────────────────────────────────────────
    case 'find_error_patterns': {
      try {
        const { logPath, timeRange } = args as {
          logPath: string
          timeRange?: { start?: string; end?: string }
        }
        const absPath = resolve(process.cwd(), logPath)
        if (!existsSync(absPath)) {
          return { content: [{ type: 'text', text: `File not found: ${absPath}` }], isError: true }
        }

        const allLines = readAllLines(absPath)
        const startDate = timeRange?.start ? new Date(timeRange.start) : null
        const endDate = timeRange?.end ? new Date(timeRange.end) : null

        const errorPattern = /\b(ERROR|WARN|FATAL|CRITICAL|EXCEPTION|Exception|error|warning)\b/i
        const patterns = new Map<string, { count: number; examples: string[]; level: string }>()

        for (const line of allLines) {
          if (!errorPattern.test(line)) continue

          // Time filter
          if (startDate || endDate) {
            const ts = extractTimestamp(line)
            if (ts) {
              if (startDate && ts < startDate) continue
              if (endDate && ts > endDate) continue
            }
          }

          const levelMatch = line.match(/\b(ERROR|WARN|FATAL|CRITICAL|warning|error)\b/i)
          const level = levelMatch ? levelMatch[1].toUpperCase() : 'UNKNOWN'

          // Extract message portion (after log level)
          const msgMatch = line.match(
            /(?:ERROR|WARN|FATAL|CRITICAL|warning|error)[:\s]+(.+)/i
          )
          const msg = msgMatch ? msgMatch[1] : line

          const normalized = normalizeLogMessage(msg)

          if (!patterns.has(normalized)) {
            patterns.set(normalized, { count: 0, examples: [], level })
          }
          const entry = patterns.get(normalized)!
          entry.count++
          if (entry.examples.length < 3) {
            entry.examples.push(line.slice(0, 200))
          }
        }

        const sorted = Array.from(patterns.entries())
          .map(([pattern, data]) => ({ pattern, ...data }))
          .sort((a, b) => b.count - a.count)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  linesAnalyzed: allLines.length,
                  uniqueErrorPatterns: sorted.length,
                  totalErrorLines: sorted.reduce((s, p) => s + p.count, 0),
                  topPatterns: sorted.slice(0, 20),
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

    // ── analyze_anomaly ────────────────────────────────────────────────────────
    case 'analyze_anomaly': {
      try {
        const { logPath, metric = 'error_rate', windowMinutes = 5 } = args as {
          logPath: string
          metric?: 'error_rate' | 'latency'
          windowMinutes?: number
        }
        const absPath = resolve(process.cwd(), logPath)
        if (!existsSync(absPath)) {
          return { content: [{ type: 'text', text: `File not found: ${absPath}` }], isError: true }
        }

        const allLines = readAllLines(absPath)
        const windowMs = windowMinutes * 60 * 1000

        const buckets = new Map<number, number[]>()

        for (const line of allLines) {
          const ts = extractTimestamp(line)
          if (!ts) continue
          const bucket = Math.floor(ts.getTime() / windowMs) * windowMs

          if (metric === 'error_rate') {
            const isError = /\b(ERROR|FATAL|CRITICAL)\b/i.test(line)
            if (!buckets.has(bucket)) buckets.set(bucket, [0, 0]) // [total, errors]
            const b = buckets.get(bucket)!
            b[0]++
            if (isError) b[1]++
          } else {
            const latency = extractLatency(line)
            if (latency !== null) {
              if (!buckets.has(bucket)) buckets.set(bucket, [])
              buckets.get(bucket)!.push(latency)
            }
          }
        }

        if (buckets.size === 0) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    metric,
                    message: 'No timestamped lines found in log file.',
                    tip: 'Ensure log lines contain ISO timestamps or Unix epoch.',
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        const bucketData = Array.from(buckets.entries())
          .sort(([a], [b]) => a - b)
          .map(([bucket, values]) => {
            const ts = new Date(bucket).toISOString()
            if (metric === 'error_rate') {
              const [total, errors] = values as [number, number]
              const rate = total > 0 ? parseFloat(((errors / total) * 100).toFixed(1)) : 0
              return { timestamp: ts, total, errors, errorRate: rate }
            } else {
              const avg = values.length > 0
                ? parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(1))
                : 0
              const max = Math.max(...values)
              return { timestamp: ts, samples: values.length, avgMs: avg, maxMs: max }
            }
          })

        // Detect spikes: values more than 2 standard deviations above mean
        const mainValues =
          metric === 'error_rate'
            ? bucketData.map((b) => (b as { errorRate: number }).errorRate)
            : bucketData.map((b) => (b as { avgMs: number }).avgMs)

        const avg = mainValues.reduce((a, b) => a + b, 0) / mainValues.length
        const stddev = Math.sqrt(
          mainValues.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / mainValues.length
        )
        const threshold = avg + 2 * stddev

        const anomalies = bucketData.filter((_, i) => mainValues[i] > threshold)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  metric,
                  windowMinutes,
                  buckets: bucketData.length,
                  baseline: {
                    avg: parseFloat(avg.toFixed(2)),
                    stddev: parseFloat(stddev.toFixed(2)),
                    spikeThreshold: parseFloat(threshold.toFixed(2)),
                  },
                  anomaliesDetected: anomalies.length,
                  anomalies,
                  allBuckets: bucketData,
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

    // ── tail_logs ──────────────────────────────────────────────────────────────
    case 'tail_logs': {
      try {
        const { logPath, lines: numLines = 50 } = args as { logPath: string; lines?: number }
        const absPath = resolve(process.cwd(), logPath)
        if (!existsSync(absPath)) {
          return { content: [{ type: 'text', text: `File not found: ${absPath}` }], isError: true }
        }

        const tail = readLastNLines(absPath, numLines)
        const stat = statSync(absPath)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  file: absPath,
                  fileSizeBytes: stat.size,
                  lastModified: stat.mtime.toISOString(),
                  linesReturned: tail.length,
                  lines: tail,
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
