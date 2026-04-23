# MCP Infrastructure Tools

> Docker container management, resource monitoring, disk usage analysis, and port inspection — DevOps from Claude Code.

## When to Use

- **Container debugging:** `list_containers` + `get_container_logs` to inspect running services
- **Resource monitoring:** `check_resource_usage` for CPU/memory per container
- **Disk management:** `check_disk_usage` finds where space is being consumed
- **Port conflicts:** `check_port_usage` identifies what's listening on a port
- **Service recovery:** `restart_service` restarts crashed containers without leaving Claude Code

## Tools

| Tool | Description |
|------|-------------|
| `list_containers` | Runs `docker ps` and returns structured container list |
| `get_container_logs` | Returns last N lines from `docker logs` |
| `check_resource_usage` | Returns `docker stats` (falls back to `ps aux` if Docker unavailable) |
| `restart_service` | Runs `docker restart` or `docker compose restart` |
| `check_disk_usage` | Runs `df -h` + `du -sh` on a path |
| `check_port_usage` | Lists all listening ports with process information |

## Setup

```bash
npm install
npm run dev
npm run build && npm start
```

## Requirements

- Docker (optional — tools degrade gracefully without it)
- `lsof` or `netstat` for port inspection (macOS/Linux)
- `netstat` for Windows

## Claude Desktop Config

```json
{
  "mcpServers": {
    "infrastructure-tools": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-12-infrastructure-tools/src/index.ts"]
    }
  }
}
```

## Usage Examples

```
list_containers(all=true)
get_container_logs(name="my-api", lines=200, timestamps=true)
check_resource_usage(containerName="my-api")
restart_service(name="my-api", useCompose=true)
check_disk_usage(path="/var/log")
check_port_usage(port=3000)
```

## Cross-Platform Support

| Feature | Linux | macOS | Windows |
|---------|-------|-------|---------|
| Docker commands | ✅ | ✅ | ✅ (Docker Desktop) |
| Port inspection | `lsof` | `lsof` | `netstat` |
| Disk usage | `df`/`du` | `df`/`du` | `Get-PSDrive` fallback |
| Process stats | `ps aux` | `ps aux` | `tasklist` fallback |

## Tips

- Use `list_containers(all=true)` to see stopped containers too — helpful for debugging crashes
- `check_disk_usage` on `/var/log` often reveals log rotation issues eating disk space
- Combine `check_port_usage` with `restart_service` when a port conflict prevents container startup
- Works without Docker installed — gracefully falls back to system-level tools
