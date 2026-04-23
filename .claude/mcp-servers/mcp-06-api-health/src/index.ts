import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { readFileSync } from 'fs'

const server = new Server(
  { name: 'mcp-api-health', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// ─── Types ────────────────────────────────────────────────────────────────────

// SSRF protection: block requests to private/internal networks
function assertPublicUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new McpError(ErrorCode.InvalidParams, `Invalid URL: ${url}`)
  }
  const hostname = parsed.hostname.toLowerCase()
  // Block private IPs and reserved hostnames
  const BLOCKED = [
    /^localhost$/,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
    /^192\.168\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^::1?$/,
    /^fd[0-9a-f]{2}:/i,
    /^fe80:/i,
    /\.local$/,
    /^169\.254\.\d+\.\d+$/,
    /^\[::1?\]$/,
  ]
  if (BLOCKED.some((re) => re.test(hostname))) {
    throw new McpError(ErrorCode.InvalidParams, `Requests to private/internal addresses are blocked: ${hostname}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new McpError(ErrorCode.InvalidParams, `Only http/https protocols are allowed, got: ${parsed.protocol}`)
  }
}

interface RequestResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: unknown
  timing: { start: number; end: number; durationMs: number }
}

async function makeRequest(
  method: string,
  url: string,
  headers?: Record<string, string>,
  body?: unknown
): Promise<RequestResult> {
  assertPublicUrl(url)
  const start = Date.now()
  const init: RequestInit = {
    method: method.toUpperCase(),
    headers: headers ?? {},
  }
  if (body !== undefined && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    const contentType =
      (headers?.['content-type'] ?? headers?.['Content-Type'] ?? '').toLowerCase()
    init.body = contentType.includes('application/json')
      ? JSON.stringify(body)
      : String(body)
    if (!contentType) {
      ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
  }

  const res = await fetch(url, init)
  const end = Date.now()

  const resHeaders: Record<string, string> = {}
  res.headers.forEach((v, k) => {
    resHeaders[k] = v
  })

  let resBody: unknown
  const ct = res.headers.get('content-type') ?? ''
  try {
    resBody = ct.includes('application/json') ? await res.json() : await res.text()
  } catch {
    resBody = await res.text().catch(() => '<unreadable body>')
  }

  return {
    status: res.status,
    statusText: res.statusText,
    headers: resHeaders,
    body: resBody,
    timing: { start, end, durationMs: end - start },
  }
}

// ─── Tool List ────────────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'test_endpoint',
      description:
        'Makes an HTTP request to the given URL and returns status, headers, body, and timing.',
      inputSchema: {
        type: 'object',
        properties: {
          method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, PATCH…)' },
          url: { type: 'string', description: 'Full URL to request' },
          headers: {
            type: 'object',
            description: 'Optional request headers as key-value pairs',
            additionalProperties: { type: 'string' },
          },
          body: { description: 'Optional request body (object or string)' },
        },
        required: ['method', 'url'],
      },
    },
    {
      name: 'validate_response_schema',
      description:
        'Tests an endpoint and checks whether the JSON response contains all expected fields.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', default: 'GET' },
          expectedFields: {
            type: 'array',
            items: { type: 'string' },
            description: 'Dot-notation field paths that must exist in the response (e.g. "data.id")',
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
          body: { description: 'Optional request body' },
        },
        required: ['url', 'expectedFields'],
      },
    },
    {
      name: 'check_breaking_changes',
      description:
        'Compares two OpenAPI spec files (JSON or YAML paths) and returns a list of breaking changes.',
      inputSchema: {
        type: 'object',
        properties: {
          baseUrl: { type: 'string', description: 'Base URL of the API (for reference)' },
          oldSpec: { type: 'string', description: 'File path to the old OpenAPI spec (JSON)' },
          newSpec: { type: 'string', description: 'File path to the new OpenAPI spec (JSON)' },
        },
        required: ['baseUrl', 'oldSpec', 'newSpec'],
      },
    },
    {
      name: 'get_endpoint_metrics',
      description:
        'Runs the endpoint N times and returns average, min, max latency and error rate.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', default: 'GET' },
          iterations: { type: 'number', default: 5, description: 'Number of requests to send' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          body: { description: 'Optional request body' },
        },
        required: ['url'],
      },
    },
    {
      name: 'load_test_endpoint',
      description:
        'Runs concurrent requests to the endpoint for a given duration and returns throughput stats.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          method: { type: 'string', default: 'GET' },
          concurrency: { type: 'number', default: 10, description: 'Number of parallel workers' },
          duration: { type: 'number', default: 5, description: 'Test duration in seconds' },
          headers: { type: 'object', additionalProperties: { type: 'string' } },
          body: { description: 'Optional request body' },
        },
        required: ['url'],
      },
    },
  ],
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function flattenOpenApiPaths(
  spec: Record<string, unknown>
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>()
  const paths = spec['paths'] as Record<string, Record<string, unknown>> | undefined
  if (!paths) return result
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'delete', 'patch', 'head', 'options'].includes(method)) {
        result.set(`${method.toUpperCase()} ${path}`, op as Record<string, unknown>)
      }
    }
  }
  return result
}

function getRequiredParams(op: Record<string, unknown>): string[] {
  const params = (op['parameters'] as Array<Record<string, unknown>> | undefined) ?? []
  return params
    .filter((p) => p['required'] === true)
    .map((p) => `${p['in']}:${p['name']}`)
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  if (!args) throw new McpError(ErrorCode.InvalidParams, 'Missing arguments')

  switch (name) {
    // ── test_endpoint ──────────────────────────────────────────────────────────
    case 'test_endpoint': {
      try {
        const { method, url, headers, body } = args as {
          method: string
          url: string
          headers?: Record<string, string>
          body?: unknown
        }
        const result = await makeRequest(method, url, headers, body)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  status: result.status,
                  statusText: result.statusText,
                  timing: result.timing,
                  headers: result.headers,
                  body: result.body,
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

    // ── validate_response_schema ───────────────────────────────────────────────
    case 'validate_response_schema': {
      try {
        const { url, method = 'GET', expectedFields, headers, body } = args as {
          url: string
          method?: string
          expectedFields: string[]
          headers?: Record<string, string>
          body?: unknown
        }

        const result = await makeRequest(method, url, headers, body)

        if (typeof result.body !== 'object' || result.body === null) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    valid: false,
                    status: result.status,
                    error: 'Response body is not a JSON object',
                    body: result.body,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        }

        const missing: string[] = []
        const present: string[] = []

        for (const field of expectedFields) {
          const value = getNestedValue(result.body, field)
          if (value === undefined) {
            missing.push(field)
          } else {
            present.push(field)
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  valid: missing.length === 0,
                  status: result.status,
                  timingMs: result.timing.durationMs,
                  presentFields: present,
                  missingFields: missing,
                  body: result.body,
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

    // ── check_breaking_changes ─────────────────────────────────────────────────
    case 'check_breaking_changes': {
      try {
        const { oldSpec: oldPath, newSpec: newPath } = args as {
          baseUrl: string
          oldSpec: string
          newSpec: string
        }

        let oldJson: Record<string, unknown>
        let newJson: Record<string, unknown>

        try {
          oldJson = JSON.parse(readFileSync(oldPath, 'utf-8'))
        } catch {
          return {
            content: [{ type: 'text', text: `Cannot read old spec at "${oldPath}"` }],
            isError: true,
          }
        }
        try {
          newJson = JSON.parse(readFileSync(newPath, 'utf-8'))
        } catch {
          return {
            content: [{ type: 'text', text: `Cannot read new spec at "${newPath}"` }],
            isError: true,
          }
        }

        const oldPaths = flattenOpenApiPaths(oldJson)
        const newPaths = flattenOpenApiPaths(newJson)

        const breakingChanges: string[] = []

        // Check removed endpoints
        for (const [endpoint] of oldPaths) {
          if (!newPaths.has(endpoint)) {
            breakingChanges.push(`REMOVED endpoint: ${endpoint}`)
          }
        }

        // Check added required params / removed params
        for (const [endpoint, oldOp] of oldPaths) {
          const newOp = newPaths.get(endpoint)
          if (!newOp) continue

          const oldRequired = new Set(getRequiredParams(oldOp))
          const newRequired = new Set(getRequiredParams(newOp))

          for (const param of newRequired) {
            if (!oldRequired.has(param)) {
              breakingChanges.push(`NEW required param in ${endpoint}: ${param}`)
            }
          }
          for (const param of oldRequired) {
            if (!newRequired.has(param)) {
              breakingChanges.push(`REMOVED required param in ${endpoint}: ${param}`)
            }
          }
        }

        // Check added endpoints (non-breaking, informational)
        const addedEndpoints: string[] = []
        for (const [endpoint] of newPaths) {
          if (!oldPaths.has(endpoint)) {
            addedEndpoints.push(endpoint)
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  breakingChangesCount: breakingChanges.length,
                  breakingChanges,
                  addedEndpoints,
                  summary: breakingChanges.length === 0
                    ? 'No breaking changes detected.'
                    : `${breakingChanges.length} breaking change(s) found.`,
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

    // ── get_endpoint_metrics ───────────────────────────────────────────────────
    case 'get_endpoint_metrics': {
      try {
        const { url, method = 'GET', iterations = 5, headers, body } = args as {
          url: string
          method?: string
          iterations?: number
          headers?: Record<string, string>
          body?: unknown
        }

        const durations: number[] = []
        const errors: string[] = []
        const statuses: number[] = []

        for (let i = 0; i < iterations; i++) {
          try {
            const result = await makeRequest(method, url, headers, body)
            durations.push(result.timing.durationMs)
            statuses.push(result.status)
          } catch (err) {
            errors.push((err as Error).message)
          }
        }

        const avg = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0
        const min = durations.length ? Math.min(...durations) : 0
        const max = durations.length ? Math.max(...durations) : 0
        const errorRate = errors.length / iterations

        const statusCounts: Record<number, number> = {}
        for (const s of statuses) {
          statusCounts[s] = (statusCounts[s] ?? 0) + 1
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  url,
                  method,
                  iterations,
                  latencyMs: { avg, min, max },
                  errorRate: `${(errorRate * 100).toFixed(1)}%`,
                  successfulRequests: durations.length,
                  failedRequests: errors.length,
                  statusCodes: statusCounts,
                  errors: errors.length > 0 ? errors : undefined,
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

    // ── load_test_endpoint ─────────────────────────────────────────────────────
    case 'load_test_endpoint': {
      try {
        const { url, method = 'GET', concurrency = 10, duration = 5, headers, body } = args as {
          url: string
          method?: string
          concurrency?: number
          duration?: number
          headers?: Record<string, string>
          body?: unknown
        }

        const results: { durationMs: number; status: number; error?: string }[] = []
        const endTime = Date.now() + duration * 1000

        async function worker() {
          while (Date.now() < endTime) {
            const start = Date.now()
            try {
              const res = await makeRequest(method, url, headers, body)
              results.push({ durationMs: res.timing.durationMs, status: res.status })
            } catch (err) {
              results.push({
                durationMs: Date.now() - start,
                status: 0,
                error: (err as Error).message,
              })
            }
          }
        }

        const workers = Array.from({ length: concurrency }, () => worker())
        await Promise.all(workers)

        const successful = results.filter((r) => r.status >= 200 && r.status < 300)
        const failed = results.filter((r) => r.status === 0 || r.status >= 400)
        const durations = results.map((r) => r.durationMs)
        const totalRequests = results.length
        const throughput = totalRequests / duration

        const avg = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0
        const min = durations.length ? Math.min(...durations) : 0
        const max = durations.length ? Math.max(...durations) : 0

        // p95
        const sorted = [...durations].sort((a, b) => a - b)
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
        const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0

        const statusCounts: Record<number, number> = {}
        for (const r of results) {
          statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  url,
                  method,
                  concurrency,
                  durationSeconds: duration,
                  totalRequests,
                  successfulRequests: successful.length,
                  failedRequests: failed.length,
                  throughputRps: parseFloat(throughput.toFixed(2)),
                  errorRate: `${((failed.length / totalRequests) * 100).toFixed(1)}%`,
                  latencyMs: { avg, min, max, p95, p99 },
                  statusCodes: statusCounts,
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

// ─── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
