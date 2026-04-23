# MCP Database Inspector Server

> PostgreSQL schema exploration, safe query execution, EXPLAIN analysis, and index recommendations.

## Installation

```bash
npm install
npm run build
```

## Requirements

- A running PostgreSQL database
- `DATABASE_URL` environment variable set (e.g. `postgres://user:pass@localhost:5432/mydb`)

## Configuration

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "database-inspector": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-03-database-inspector/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgres://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

## Tools

### `get_schema`

Returns table structure: columns, data types, constraints, and indexes.

```
get_schema()                          # all tables in public schema
get_schema(tableName: "users")        # specific table
get_schema(tableName: "orders", schema: "billing")
```

### `run_query`

Executes a **read-only SELECT** query. INSERT/UPDATE/DELETE/DROP are automatically rejected:

```
run_query(sql: "SELECT id, email, created_at FROM users WHERE active = true LIMIT 10")
run_query(sql: "SELECT count(*) FROM orders WHERE status = 'pending'", limit: 500)
```

### `explain_query`

Runs `EXPLAIN ANALYZE` and returns the execution plan with performance tips:

```
explain_query(sql: "SELECT * FROM orders JOIN users ON orders.user_id = users.id WHERE orders.status = 'pending'")
```

Returns: text plan, JSON plan, and automated tips (e.g. "Sequential scan detected — consider adding an index").

### `check_indexes`

Analyzes index usage for a table, reports unindexed columns, and compares sequential vs index scans:

```
check_indexes(tableName: "orders")
```

### `get_table_stats`

Returns row count, table size, dead row ratio, and last vacuum/analyze timestamps:

```
get_table_stats(tableName: "events")
```

## Security

- Only SELECT queries are allowed via `run_query`
- The server connects with whatever permissions `DATABASE_URL` grants — use a read-only role for extra safety
- No DDL or DML operations are possible through this server

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run with `tsx` (no build) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled output |
