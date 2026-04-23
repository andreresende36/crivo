# MCP Log Analyzer Server

> Log file searching, request correlation, error pattern grouping, anomaly detection, and log tailing — production debugging from Claude Code.

## When to Use

- **Incident response:** `search_logs` + `correlate_request` to trace a specific request across log files
- **Error triage:** `find_error_patterns` groups recurring errors by frequency — fix the most impactful first
- **Anomaly detection:** `analyze_anomaly` alerts on latency/error spikes using statistical analysis (σ > 2)
- **Real-time monitoring:** `tail_logs` watches the latest output during debugging sessions
- **Post-mortem analysis:** Combine all tools to reconstruct incident timelines

## Tools

| Tool | Description |
|------|-------------|
| `search_logs` | Reads last N lines of a log file, filters by regex |
| `correlate_request` | Searches all log files for a correlation/request ID |
| `find_error_patterns` | Groups ERROR/WARN lines by normalized pattern, returns frequencies |
| `analyze_anomaly` | Detects spikes in error rate or latency (σ > 2 std deviations) |
| `tail_logs` | Returns the last N lines from a log file |

## Setup

```bash
npm install
npm run dev
npm run build && npm start
```

## Claude Desktop Config

```json
{
  "mcpServers": {
    "log-analyzer": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-10-log-analyzer/src/index.ts"]
    }
  }
}
```

## Usage Examples

```
tail_logs(logPath="/var/log/app/app.log", lines=100)
search_logs(query="ERROR.*database", logPath="/var/log/app/app.log", lines=500)
correlate_request(correlationId="abc-123-xyz", logPath="/var/log/app/")
find_error_patterns(logPath="/var/log/app/app.log")
analyze_anomaly(logPath="/var/log/app/access.log", metric="latency", windowMinutes=5)
```

## Anomaly Detection

The `analyze_anomaly` tool:
1. Parses timestamps from log lines
2. Buckets lines into time windows
3. Computes mean and standard deviation
4. Flags buckets where the value exceeds `mean + 2σ`

## Supported Log Formats

- Standard structured JSON logs (one JSON object per line)
- Common syslog format (`timestamp level message`)
- Nginx/Apache access logs
- Custom formats (the tool extracts timestamps and levels heuristically)

## Tips

- Set `logPath` to a directory to search across ALL log files in that directory
- Use `correlate_request` with your `X-Request-ID` or `traceId` header value for distributed tracing
- Combine `find_error_patterns` with `mcp-06-api-health` to correlate server errors with endpoint failures
- Keep last 7 days of logs accessible for `analyze_anomaly` to have meaningful statistical baselines
