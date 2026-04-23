import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { execSync } from 'child_process'
import os from 'os'

const server = new Server(
  { name: 'mcp-infrastructure-tools', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_containers',
      description: 'Runs docker ps and returns structured container list.',
      inputSchema: {
        type: 'object',
        properties: {
          all: {
            type: 'boolean',
            default: false,
            description: 'If true, includes stopped containers (docker ps -a).',
          },
        },
      },
    },
    {
      name: 'get_container_logs',
      description: 'Returns the last N lines of logs from a Docker container.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Container name or ID.' },
          lines: { type: 'number', default: 100, description: 'Number of log lines to retrieve.' },
          timestamps: { type: 'boolean', default: false, description: 'Include timestamps in output.' },
        },
        required: ['name'],
      },
    },
    {
      name: 'check_resource_usage',
      description: 'Returns live resource usage for all running Docker containers or system top processes.',
      inputSchema: {
        type: 'object',
        properties: {
          containerName: {
            type: 'string',
            description: 'Optional: specific container name to check. If omitted, checks all.',
          },
        },
      },
    },
    {
      name: 'restart_service',
      description: 'Restarts a Docker container or docker compose service.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Container or service name to restart.' },
          useCompose: {
            type: 'boolean',
            default: false,
            description: 'If true, uses "docker compose restart" instead of "docker restart".',
          },
          composeFile: {
            type: 'string',
            description: 'Path to docker-compose.yml if not in cwd.',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'check_disk_usage',
      description: 'Returns disk usage for a path using df and du.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', default: '/', description: 'Path to check disk usage for.' },
        },
      },
    },
    {
      name: 'check_port_usage',
      description: 'Returns all listening TCP/UDP ports and the processes using them.',
      inputSchema: {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            description: 'Optional: specific port number to check.',
          },
        },
      },
    },
  ],
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeExec(cmd: string, options?: { timeout?: number; cwd?: string }): { stdout: string; error: string | null } {
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: options?.timeout ?? 15000,
      cwd: options?.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout, error: null }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { stdout: e.stdout ?? '', error: e.stderr ?? e.message ?? String(err) }
  }
}

function isWindows(): boolean {
  return os.platform() === 'win32'
}

interface DockerContainer {
  id: string
  name: string
  image: string
  status: string
  ports: string
  created: string
}

interface DockerStats {
  name: string
  cpuPercent: string
  memUsage: string
  memPercent: string
  netIO: string
  blockIO: string
  pids: string
}

function parseDockerPsJson(stdout: string): DockerContainer[] {
  const containers: DockerContainer[] = []
  // docker ps --format json outputs one JSON object per line (not an array)
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const obj = JSON.parse(trimmed)
      containers.push({
        id: obj.ID ?? obj.ContainerID ?? '',
        name: obj.Names ?? obj.Name ?? '',
        image: obj.Image ?? '',
        status: obj.Status ?? obj.State ?? '',
        ports: obj.Ports ?? '',
        created: obj.CreatedAt ?? '',
      })
    } catch { /* skip */ }
  }
  return containers
}

function parseDockerStatsJson(stdout: string): DockerStats[] {
  const stats: DockerStats[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const obj = JSON.parse(trimmed)
      stats.push({
        name: obj.Name ?? obj.Container ?? '',
        cpuPercent: obj.CPUPerc ?? obj.CPU ?? '',
        memUsage: obj.MemUsage ?? obj.MemPerc ?? '',
        memPercent: obj.MemPerc ?? '',
        netIO: obj.NetIO ?? '',
        blockIO: obj.BlockIO ?? '',
        pids: obj.PIDs ?? obj.Pids ?? '',
      })
    } catch { /* skip */ }
  }
  return stats
}

// ─── Request Handler ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  if (!args) throw new McpError(ErrorCode.InvalidParams, 'Missing arguments')

  switch (name) {
    // ── list_containers ────────────────────────────────────────────────────────
    case 'list_containers': {
      try {
        const { all = false } = args as { all?: boolean }
        const allFlag = all ? ' -a' : ''
        const { stdout, error } = safeExec(
          `docker ps${allFlag} --format "{{json .}}"`,
          { timeout: 10000 }
        )

        if (error && !stdout) {
          // Docker might not be installed
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { error: 'Docker not available or not running.', details: error },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          }
        }

        const containers = parseDockerPsJson(stdout)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { totalContainers: containers.length, containers },
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

    // ── get_container_logs ─────────────────────────────────────────────────────
    case 'get_container_logs': {
      try {
        const { name: containerName, lines = 100, timestamps = false } = args as {
          name: string
          lines?: number
          timestamps?: boolean
        }

        const tsFlag = timestamps ? ' --timestamps' : ''
        const cmd = `docker logs --tail ${lines}${tsFlag} ${containerName}`
        const { stdout, error } = safeExec(cmd, { timeout: 10000 })

        if (error && !stdout) {
          return {
            content: [
              { type: 'text', text: `Failed to get logs for "${containerName}": ${error}` },
            ],
            isError: true,
          }
        }

        // docker logs writes to stderr by default
        const logLines = (stdout + (error ?? '')).split('\n').filter(Boolean)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  container: containerName,
                  linesRequested: lines,
                  linesReturned: logLines.length,
                  logs: logLines,
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

    // ── check_resource_usage ───────────────────────────────────────────────────
    case 'check_resource_usage': {
      try {
        const { containerName } = args as { containerName?: string }

        const targetFlag = containerName ? ` ${containerName}` : ''
        const { stdout, error } = safeExec(
          `docker stats --no-stream --format "{{json .}}"${targetFlag}`,
          { timeout: 15000 }
        )

        if (error && !stdout) {
          // Fallback to top/ps if docker not available
          const platform = os.platform()
          let fallbackOutput: string
          try {
            fallbackOutput = platform === 'win32'
              ? execSync('tasklist /FO CSV /NH | sort /R /+5', { encoding: 'utf-8', timeout: 5000 })
                .split('\n')
                .slice(0, 15)
                .join('\n')
              : execSync('ps aux --sort=-%cpu | head -16 | tail -15', { encoding: 'utf-8', timeout: 5000 })
          } catch {
            fallbackOutput = 'Could not retrieve process list'
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  { source: 'system-ps', note: 'Docker not available', processes: fallbackOutput.split('\n') },
                  null,
                  2
                ),
              },
            ],
          }
        }

        const stats = parseDockerStatsJson(stdout)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { source: 'docker-stats', containerCount: stats.length, stats },
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

    // ── restart_service ────────────────────────────────────────────────────────
    case 'restart_service': {
      try {
        const { name: serviceName, useCompose = false, composeFile } = args as {
          name: string
          useCompose?: boolean
          composeFile?: string
        }

        // Security: validate service name — alphanumeric, dash, underscore, dot only
        const SAFE_NAME = /^[a-zA-Z0-9._-]+$/
        if (!SAFE_NAME.test(serviceName)) {
          throw new McpError(ErrorCode.InvalidParams, `Invalid service name: ${serviceName}`)
        }
        if (composeFile && !SAFE_NAME.test(composeFile.replace(/[\\/]/g, '_'))) {
          throw new McpError(ErrorCode.InvalidParams, `Invalid compose file path: ${composeFile}`)
        }

        let cmd: string
        if (useCompose) {
          const fileFlag = composeFile ? ` -f ${composeFile}` : ''
          cmd = `docker compose${fileFlag} restart ${serviceName}`
        } else {
          cmd = `docker restart ${serviceName}`
        }

        const { stdout, error } = safeExec(cmd, { timeout: 30000 })

        if (error && !stdout) {
          return {
            content: [
              { type: 'text', text: `Failed to restart "${serviceName}": ${error}` },
            ],
            isError: true,
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  service: serviceName,
                  command: cmd,
                  output: stdout.trim() || `${serviceName} restarted successfully`,
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

    // ── check_disk_usage ───────────────────────────────────────────────────────
    case 'check_disk_usage': {
      try {
        const { path: checkPath = '/' } = args as { path?: string }
        const platform = os.platform()

        let dfOutput: string
        let duOutput: string

        if (platform === 'win32') {
          const { stdout: dfOut } = safeExec(`wmic logicaldisk get size,freespace,caption`, { timeout: 8000 })
          dfOutput = dfOut

          const { stdout: duOut } = safeExec(
            `cmd /c dir "${checkPath}" /s 2>nul | findstr "bytes"`,
            { timeout: 10000 }
          )
          duOutput = duOut
        } else {
          const { stdout: dfOut } = safeExec(`df -h "${checkPath}"`, { timeout: 8000 })
          dfOutput = dfOut

          const { stdout: duOut } = safeExec(`du -sh "${checkPath}" 2>/dev/null`, { timeout: 10000 })
          duOutput = duOut
        }

        // Parse df output for structured data
        const dfLines = dfOutput.trim().split('\n').filter(Boolean)
        const headers = dfLines[0]?.split(/\s+/) ?? []
        const diskInfo = dfLines.slice(1).map((line) => {
          const parts = line.split(/\s+/)
          const info: Record<string, string> = {}
          headers.forEach((h, i) => {
            info[h] = parts[i] ?? ''
          })
          return info
        })

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  path: checkPath,
                  diskFilesystem: diskInfo,
                  pathSize: duOutput.trim().split('\n')[0] ?? 'unknown',
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

    // ── check_port_usage ──────────────────────────────────────────────────────
    case 'check_port_usage': {
      try {
        const { port } = args as { port?: number }
        const platform = os.platform()

        interface PortInfo {
          protocol: string
          localAddress: string
          port: string
          state: string
          process: string
        }

        let ports: PortInfo[] = []

        if (platform === 'win32') {
          const portFlag = ''
          const { stdout, error } = safeExec(
            `netstat -ano | findstr LISTENING`,
            { timeout: 10000 }
          )

          if (stdout) {
            for (const line of stdout.split('\n')) {
              const parts = line.trim().split(/\s+/)
              if (parts.length < 4) continue
              const [proto, local, , state, pid] = parts
              const localParts = (local ?? '').split(':')
              const portNum = localParts[localParts.length - 1] ?? ''

              if (port && portNum !== String(port)) continue

              ports.push({
                protocol: proto ?? '',
                localAddress: (localParts.slice(0, -1).join(':')) || (local ?? ''),
                port: portNum,
                state: state ?? 'LISTENING',
                process: pid ?? '',
              })
            }
          }
        } else {
          // Linux/macOS: use ss or lsof
          let cmd = 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null'
          if (os.platform() === 'darwin') {
            cmd = 'lsof -i -P -n | grep LISTEN'
          }

          const { stdout } = safeExec(cmd, { timeout: 10000 })

          for (const line of stdout.split('\n')) {
            if (!line.trim()) continue

            // lsof output
            const lsofMatch = line.match(
              /(\S+)\s+(\d+)\s+\S+.*?(\S+):(\d+)\s+\(LISTEN\)/
            )
            if (lsofMatch) {
              if (port && lsofMatch[4] !== String(port)) continue
              ports.push({
                protocol: 'tcp',
                localAddress: lsofMatch[3] ?? '',
                port: lsofMatch[4] ?? '',
                state: 'LISTEN',
                process: `${lsofMatch[1]}(PID:${lsofMatch[2]})`,
              })
              continue
            }

            // ss/netstat output
            const parts = line.trim().split(/\s+/)
            if (parts[0] === 'tcp' || parts[0] === 'tcp6' || parts[0] === 'udp') {
              const localAddr = parts[3] ?? parts[4] ?? ''
              const localParts = localAddr.split(':')
              const portNum = localParts[localParts.length - 1] ?? ''

              if (port && portNum !== String(port)) continue

              ports.push({
                protocol: parts[0],
                localAddress: localParts.slice(0, -1).join(':').replace(/[\[\]]/g, '') || localAddr,
                port: portNum,
                state: parts[1] ?? 'LISTEN',
                process: parts[parts.length - 1] ?? '',
              })
            }
          }
        }

        // Deduplicate by port
        const seen = new Set<string>()
        ports = ports.filter((p) => {
          const key = `${p.protocol}:${p.port}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })

        ports.sort((a, b) => parseInt(a.port) - parseInt(b.port))

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  listeningPorts: ports.length,
                  filtered: port ? `port ${port}` : 'all listening ports',
                  ports,
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
