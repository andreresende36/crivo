import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { Pool, PoolClient } from 'pg'

// ──────────────────────────────────────────────────────────────
// Database connection
// ──────────────────────────────────────────────────────────────

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL
    if (!url) {
      throw new Error('DATABASE_URL environment variable is not set.')
    }
    pool = new Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30000 })
  }
  return pool
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

// ──────────────────────────────────────────────────────────────
// Query safety guard
// ──────────────────────────────────────────────────────────────

const DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CALL)\b/i

function assertReadOnly(sql: string): void {
  if (DANGEROUS_KEYWORDS.test(sql)) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      'Only SELECT queries are allowed. Detected a write/DDL operation in the query.'
    )
  }
}

// ──────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-database-inspector', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_schema',
      description: 'Returns the schema for one or all tables: columns, types, constraints, and indexes.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tableName: { type: 'string', description: 'Specific table name to inspect. Omit to list all tables.' },
          schema: { type: 'string', description: 'PostgreSQL schema name (default: public)' },
        },
        required: [],
      },
    },
    {
      name: 'run_query',
      description: 'Runs a read-only SELECT query and returns the results. INSERT/UPDATE/DELETE/DROP are rejected.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sql: { type: 'string', description: 'The SELECT SQL query to run' },
          limit: { type: 'number', description: 'Max rows to return (default: 100, max: 1000)' },
        },
        required: ['sql'],
      },
    },
    {
      name: 'explain_query',
      description: 'Runs EXPLAIN ANALYZE on a SELECT query and returns the execution plan with cost estimates.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          sql: { type: 'string', description: 'The SELECT SQL query to explain' },
        },
        required: ['sql'],
      },
    },
    {
      name: 'check_indexes',
      description: 'Checks a table for potentially missing indexes by analyzing columns used in frequent filters.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tableName: { type: 'string', description: 'Table name to analyze for missing indexes' },
          schema: { type: 'string', description: 'PostgreSQL schema name (default: public)' },
        },
        required: ['tableName'],
      },
    },
    {
      name: 'get_table_stats',
      description: 'Returns row count, table size on disk, bloat estimate, and last vacuum/analyze timestamps.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          tableName: { type: 'string', description: 'Table name to get stats for' },
          schema: { type: 'string', description: 'PostgreSQL schema name (default: public)' },
        },
        required: ['tableName'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    // ── get_schema ──────────────────────────────────────────────
    case 'get_schema': {
      const { tableName, schema = 'public' } = args as { tableName?: string; schema?: string }
      try {
        return await withClient(async (client) => {
          const tableFilter = tableName ? `AND t.table_name = $2` : ''
          const queryParams: string[] = [schema, ...(tableName ? [tableName] : [])]

          // Get columns
          const columnsResult = await client.query(
            `SELECT 
              t.table_name,
              c.column_name,
              c.data_type,
              c.character_maximum_length,
              c.is_nullable,
              c.column_default,
              c.ordinal_position
            FROM information_schema.tables t
            JOIN information_schema.columns c 
              ON c.table_name = t.table_name AND c.table_schema = t.table_schema
            WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
            ${tableFilter}
            ORDER BY t.table_name, c.ordinal_position`,
            queryParams
          )

          // Get constraints
          const constraintsResult = await client.query(
            `SELECT
              tc.table_name,
              tc.constraint_name,
              tc.constraint_type,
              kcu.column_name,
              ccu.table_name AS foreign_table,
              ccu.column_name AS foreign_column
            FROM information_schema.table_constraints tc
            LEFT JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.constraint_column_usage ccu
              ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
            WHERE tc.table_schema = $1 ${tableFilter.replace('t.table_name', 'tc.table_name')}
            ORDER BY tc.table_name`,
            queryParams
          )

          // Get indexes
          const indexesResult = await client.query(
            `SELECT
              indexname,
              tablename,
              indexdef
            FROM pg_indexes
            WHERE schemaname = $1 ${tableName ? 'AND tablename = $2' : ''}
            ORDER BY tablename, indexname`,
            queryParams
          )

          // Build structured result
          const tables: Record<string, { columns: unknown[]; constraints: unknown[]; indexes: unknown[] }> = {}
          for (const row of columnsResult.rows) {
            if (!tables[row.table_name]) tables[row.table_name] = { columns: [], constraints: [], indexes: [] }
            tables[row.table_name].columns.push(row)
          }
          for (const row of constraintsResult.rows) {
            if (tables[row.table_name]) tables[row.table_name].constraints.push(row)
          }
          for (const row of indexesResult.rows) {
            if (tables[row.tablename]) tables[row.tablename].indexes.push(row)
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ schema, tables }, null, 2),
              },
            ],
          }
        })
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `get_schema failed: ${(err as Error).message}`)
      }
    }

    // ── run_query ───────────────────────────────────────────────
    case 'run_query': {
      const { sql, limit = 100 } = args as { sql: string; limit?: number }
      try {
        assertReadOnly(sql)
        const safeLimit = Math.min(limit, 1000)
        const wrappedSql = `SELECT * FROM (${sql}) AS _mcp_query LIMIT ${safeLimit}`

        return await withClient(async (client) => {
          const start = Date.now()
          const result = await client.query(wrappedSql)
          const elapsed = Date.now() - start

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    rowCount: result.rows.length,
                    fields: result.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
                    rows: result.rows,
                    executionTimeMs: elapsed,
                    note: result.rows.length === safeLimit ? `Result capped at ${safeLimit} rows.` : undefined,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        })
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `run_query failed: ${(err as Error).message}`)
      }
    }

    // ── explain_query ───────────────────────────────────────────
    case 'explain_query': {
      const { sql } = args as { sql: string }
      try {
        assertReadOnly(sql)
        return await withClient(async (client) => {
          // Use EXPLAIN ANALYZE with BUFFERS for maximum insight
          const result = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`)
          const planJson = result.rows[0]['QUERY PLAN']

          // Also get text plan for readability
          const textResult = await client.query(`EXPLAIN ANALYZE ${sql}`)
          const textPlan = textResult.rows.map((r: Record<string, string>) => r['QUERY PLAN']).join('\n')

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    query: sql,
                    textPlan,
                    jsonPlan: planJson,
                    tips: analyzePlan(textPlan),
                  },
                  null,
                  2
                ),
              },
            ],
          }
        })
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `explain_query failed: ${(err as Error).message}`)
      }
    }

    // ── check_indexes ───────────────────────────────────────────
    case 'check_indexes': {
      const { tableName, schema = 'public' } = args as { tableName: string; schema?: string }
      try {
        return await withClient(async (client) => {
          // Get existing indexes
          const indexesResult = await client.query(
            `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = $1 AND tablename = $2`,
            [schema, tableName]
          )

          // Get columns
          const columnsResult = await client.query(
            `SELECT column_name, data_type FROM information_schema.columns 
             WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`,
            [schema, tableName]
          )

          // Get pg_stats for column usage hints
          const statsResult = await client.query(
            `SELECT attname, n_distinct, correlation
             FROM pg_stats WHERE schemaname = $1 AND tablename = $2`,
            [schema, tableName]
          )

          // Get sequential scan stats
          const seqScanResult = await client.query(
            `SELECT seq_scan, idx_scan, n_live_tup
             FROM pg_stat_user_tables WHERE schemaname = $1 AND relname = $2`,
            [schema, tableName]
          )

          const indexedCols = indexesResult.rows.flatMap((idx) => {
            const m = idx.indexdef.match(/\(([^)]+)\)/)
            return m ? m[1].split(',').map((c: string) => c.trim().toLowerCase()) : []
          })

          const unindexedCols = columnsResult.rows
            .filter((col) => !indexedCols.includes(col.column_name.toLowerCase()))
            .map((col) => col.column_name)

          const stats = seqScanResult.rows[0] ?? {}

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    tableName,
                    existingIndexes: indexesResult.rows,
                    columns: columnsResult.rows,
                    columnStats: statsResult.rows,
                    unindexedColumns: unindexedCols,
                    scanStats: {
                      sequentialScans: stats.seq_scan,
                      indexScans: stats.idx_scan,
                      liveRows: stats.n_live_tup,
                      recommendation:
                        parseInt(stats.seq_scan ?? '0') > parseInt(stats.idx_scan ?? '0')
                          ? 'High sequential scan ratio — consider adding indexes.'
                          : 'Index usage looks healthy.',
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          }
        })
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `check_indexes failed: ${(err as Error).message}`)
      }
    }

    // ── get_table_stats ─────────────────────────────────────────
    case 'get_table_stats': {
      const { tableName, schema = 'public' } = args as { tableName: string; schema?: string }
      try {
        return await withClient(async (client) => {
          const result = await client.query(
            `SELECT
              s.relname AS table_name,
              c.reltuples::bigint AS estimated_rows,
              pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
              pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
              pg_size_pretty(pg_indexes_size(c.oid)) AS indexes_size,
              s.n_live_tup AS live_rows,
              s.n_dead_tup AS dead_rows,
              s.n_mod_since_analyze AS mods_since_analyze,
              s.last_vacuum,
              s.last_autovacuum,
              s.last_analyze,
              s.last_autoanalyze,
              s.seq_scan,
              s.seq_tup_read,
              s.idx_scan,
              s.idx_tup_fetch
            FROM pg_stat_user_tables s
            JOIN pg_class c ON c.relname = s.relname
            WHERE s.schemaname = $1 AND s.relname = $2`,
            [schema, tableName]
          )

          if (result.rows.length === 0) {
            throw new McpError(ErrorCode.InvalidRequest, `Table "${schema}.${tableName}" not found.`)
          }

          const row = result.rows[0]
          const bloatEstimate =
            row.dead_rows > 0
              ? `~${((row.dead_rows / (row.live_rows + row.dead_rows)) * 100).toFixed(1)}% dead rows`
              : 'No significant bloat'

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ ...row, bloatEstimate }, null, 2),
              },
            ],
          }
        })
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `get_table_stats failed: ${(err as Error).message}`)
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`)
  }
})

// ──────────────────────────────────────────────────────────────
// Plan analyzer helper
// ──────────────────────────────────────────────────────────────

function analyzePlan(textPlan: string): string[] {
  const tips: string[] = []
  if (/Seq Scan/.test(textPlan)) tips.push('Sequential scan detected — consider adding an index.')
  if (/Hash Join/.test(textPlan)) tips.push('Hash join used — ensure join columns are indexed for large tables.')
  if (/Nested Loop/.test(textPlan)) tips.push('Nested loop detected — check that inner loop uses an index.')
  if (/cost=\d+\.\d+\.\.(\d{5,})/.test(textPlan)) tips.push('High total cost — query may be slow at scale.')
  if (/rows=(\d{6,})/.test(textPlan)) tips.push('Large row estimate — consider pagination or limit clauses.')
  if (tips.length === 0) tips.push('Plan looks reasonable. No obvious issues detected.')
  return tips
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
