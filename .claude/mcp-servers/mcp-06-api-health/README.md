# MCP API Health Monitor

> HTTP endpoint testing, schema validation, load testing, and breaking change detection — all from Claude Code.

## When to Use

- **Pre-deploy checks:** Run `test_endpoint` against staging before pushing to production
- **API contract validation:** `validate_response_schema` catches missing fields before your frontend breaks
- **Performance baselines:** `get_endpoint_metrics` tracks latency regressions across releases
- **Breaking change detection:** `check_breaking_changes` compares OpenAPI specs between versions
- **Load testing:** `load_test_endpoint` reveals concurrency limits before users hit them

## Tools

| Tool | Description |
|------|-------------|
| `test_endpoint` | Makes an HTTP request and returns status, headers, body, timing |
| `validate_response_schema` | Checks that a response contains all expected fields |
| `check_breaking_changes` | Compares two OpenAPI JSON spec files for breaking changes |
| `get_endpoint_metrics` | Runs endpoint N times, returns avg/min/max latency + error rate |
| `load_test_endpoint` | Runs concurrent requests for N seconds, returns throughput stats |

## Setup

```bash
npm install
npm run dev    # development with tsx
npm run build  # compile TypeScript
npm start      # run compiled
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "api-health": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-06-api-health/src/index.ts"]
    }
  }
}
```

## Usage Examples

```
test_endpoint(method="GET", url="https://api.example.com/health")
validate_response_schema(url="https://api.example.com/users/1", expectedFields=["id","name","email"])
get_endpoint_metrics(url="https://api.example.com/users", method="GET", iterations=10)
load_test_endpoint(url="https://api.example.com/users", concurrency=20, duration=10)
check_breaking_changes(baseUrl="https://api.example.com", oldSpec="./v1.json", newSpec="./v2.json")
```

## Output Format

All tools return structured JSON with:
- `status`: success/error
- `data`: tool-specific results
- `timing`: execution time in ms

Example `test_endpoint` output:
```json
{
  "status": 200,
  "latencyMs": 45,
  "headers": { "content-type": "application/json" },
  "bodyPreview": "{\"ok\": true}"
}
```

## Tips

- Combine `test_endpoint` + `validate_response_schema` in a CLAUDE.md hook for automated pre-commit API checks
- Use `get_endpoint_metrics` with `iterations=50` for statistically meaningful latency baselines
- Store OpenAPI spec snapshots in `.claude/api-specs/` for `check_breaking_changes` comparisons
