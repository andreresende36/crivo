import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { execSync } from 'child_process'
import { readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const server = new Server(
  { name: 'mcp-dependency-scanner', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// ─── Tool Definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'scan_vulnerabilities',
      description:
        'Runs npm audit or pip audit and returns a structured list of vulnerabilities.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: {
            type: 'string',
            description: 'Path to project directory. Defaults to cwd.',
          },
          type: {
            type: 'string',
            enum: ['npm', 'pip', 'auto'],
            default: 'auto',
            description: 'Package manager type. "auto" detects from project files.',
          },
        },
      },
    },
    {
      name: 'suggest_updates',
      description:
        'Runs npm outdated and returns packages with current/wanted/latest versions.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project. Defaults to cwd.' },
        },
      },
    },
    {
      name: 'check_licenses',
      description:
        'Reads package.json dependencies, extracts licenses, and flags problematic ones (GPL, AGPL for commercial use).',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project. Defaults to cwd.' },
          type: {
            type: 'string',
            enum: ['permissive', 'copyleft', 'all'],
            default: 'all',
            description: 'Filter license type to show.',
          },
        },
      },
    },
    {
      name: 'analyze_bundle_impact',
      description:
        'Estimates the disk footprint of top dependencies by measuring node_modules subdirectories.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project. Defaults to cwd.' },
          topN: { type: 'number', default: 20, description: 'Number of top packages to show.' },
        },
      },
    },
    {
      name: 'check_outdated',
      description:
        'Returns packages that are more than 2 major versions behind latest.',
      inputSchema: {
        type: 'object',
        properties: {
          projectPath: { type: 'string', description: 'Path to project. Defaults to cwd.' },
        },
      },
    },
  ],
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runCommand(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
}

function safeRunCommand(cmd: string, cwd: string): { stdout: string; error: string | null } {
  try {
    return { stdout: runCommand(cmd, cwd), error: null }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { stdout: e.stdout ?? '', error: e.stderr ?? e.message ?? String(err) }
  }
}

function detectProjectType(projectPath: string): 'npm' | 'pip' | 'unknown' {
  if (existsSync(join(projectPath, 'package.json'))) return 'npm'
  if (
    existsSync(join(projectPath, 'requirements.txt')) ||
    existsSync(join(projectPath, 'pyproject.toml')) ||
    existsSync(join(projectPath, 'setup.py'))
  )
    return 'pip'
  return 'unknown'
}

function parseSemver(version: string): [number, number, number] {
  const clean = version.replace(/^[^0-9]*/, '')
  const parts = clean.split('.').map((p) => parseInt(p, 10) || 0)
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0]
}

const COPYLEFT_LICENSES = new Set([
  'GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'AGPL-1.0', 'LGPL-2.0', 'LGPL-2.1', 'LGPL-3.0',
  'GPL-2.0-only', 'GPL-3.0-only', 'AGPL-3.0-only',
  'OSL-3.0', 'EUPL-1.1', 'EUPL-1.2', 'CC-BY-SA-4.0',
])

const PERMISSIVE_LICENSES = new Set([
  'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'CC0-1.0',
  '0BSD', 'Unlicense', 'WTFPL', 'BlueOak-1.0.0',
])

function classifyLicense(license: string): 'permissive' | 'copyleft' | 'unknown' | 'proprietary' {
  if (!license || license === 'UNLICENSED') return 'proprietary'
  const up = license.toUpperCase()
  if (COPYLEFT_LICENSES.has(license)) return 'copyleft'
  if (PERMISSIVE_LICENSES.has(license)) return 'permissive'
  if (up.includes('GPL') || up.includes('AGPL')) return 'copyleft'
  if (up.includes('MIT') || up.includes('BSD') || up.includes('APACHE') || up.includes('ISC'))
    return 'permissive'
  return 'unknown'
}

function getDirSizeKb(dir: string): number {
  try {
    let total = 0
    const stack = [dir]
    while (stack.length > 0) {
      const current = stack.pop()!
      try {
        for (const entry of readdirSync(current)) {
          const full = join(current, entry)
          try {
            const stat = statSync(full)
            if (stat.isDirectory()) stack.push(full)
            else total += stat.size
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
    return Math.round(total / 1024)
  } catch {
    return 0
  }
}

// ─── Request Handler ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  if (!args) throw new McpError(ErrorCode.InvalidParams, 'Missing arguments')

  switch (name) {
    // ── scan_vulnerabilities ───────────────────────────────────────────────────
    case 'scan_vulnerabilities': {
      try {
        const projectPath = resolve(process.cwd(), (args as Record<string, string>).projectPath ?? '.')
        const typeArg = (args as Record<string, string>).type ?? 'auto'
        const projectType =
          typeArg === 'auto' ? detectProjectType(projectPath) : (typeArg as 'npm' | 'pip')

        if (projectType === 'npm') {
          const { stdout, error } = safeRunCommand('npm audit --json', projectPath)
          let parsed: Record<string, unknown> = {}
          try {
            parsed = JSON.parse(stdout)
          } catch {
            return {
              content: [
                { type: 'text', text: `npm audit failed: ${error ?? 'No output'}\nRaw: ${stdout.slice(0, 500)}` },
              ],
              isError: true,
            }
          }

          const vulns = parsed['vulnerabilities'] as Record<
            string,
            { severity: string; via: unknown[]; fixAvailable: unknown }
          > | undefined
          const metadata = parsed['metadata'] as Record<string, unknown> | undefined

          const structured = vulns
            ? Object.entries(vulns).map(([pkg, v]) => ({
                package: pkg,
                severity: v.severity,
                fixAvailable: v.fixAvailable,
              }))
            : []

          const bySeverity: Record<string, number> = {}
          for (const v of structured) {
            bySeverity[v.severity] = (bySeverity[v.severity] ?? 0) + 1
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    projectType: 'npm',
                    totalVulnerabilities: structured.length,
                    bySeverity,
                    vulnerabilities: structured,
                    metadata,
                  },
                  null,
                  2
                ),
              },
            ],
          }
        } else if (projectType === 'pip') {
          const { stdout, error } = safeRunCommand('pip-audit --format json 2>&1', projectPath)
          try {
            const parsed = JSON.parse(stdout) as Array<{
              name: string
              version: string
              vulns: Array<{ id: string; fix_versions: string[] }>
            }>
            const structured = parsed.flatMap((pkg) =>
              pkg.vulns.map((v) => ({
                package: pkg.name,
                version: pkg.version,
                vulnId: v.id,
                fixVersions: v.fix_versions,
              }))
            )
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    { projectType: 'pip', totalVulnerabilities: structured.length, vulnerabilities: structured },
                    null,
                    2
                  ),
                },
              ],
            }
          } catch {
            return {
              content: [
                { type: 'text', text: `pip-audit output parse failed. Raw: ${stdout.slice(0, 500)}\nErr: ${error ?? ''}` },
              ],
              isError: true,
            }
          }
        } else {
          return {
            content: [
              { type: 'text', text: 'Could not detect project type (no package.json or requirements.txt found).' },
            ],
            isError: true,
          }
        }
      } catch (err) {
        return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true }
      }
    }

    // ── suggest_updates ────────────────────────────────────────────────────────
    case 'suggest_updates': {
      try {
        const projectPath = resolve(process.cwd(), (args as Record<string, string>).projectPath ?? '.')
        const { stdout, error } = safeRunCommand('npm outdated --json', projectPath)

        if (!stdout.trim()) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ allUpToDate: true, packages: [] }, null, 2) }],
          }
        }

        let parsed: Record<string, { current: string; wanted: string; latest: string; type: string }> = {}
        try {
          parsed = JSON.parse(stdout)
        } catch {
          return {
            content: [{ type: 'text', text: `Failed to parse npm outdated output: ${error ?? stdout.slice(0, 300)}` }],
            isError: true,
          }
        }

        const packages = Object.entries(parsed).map(([pkg, info]) => {
          const [curMajor] = parseSemver(info.current)
          const [latestMajor] = parseSemver(info.latest)
          const majorsBehind = latestMajor - curMajor

          return {
            package: pkg,
            current: info.current,
            wanted: info.wanted,
            latest: info.latest,
            type: info.type,
            majorsBehind,
            priority: majorsBehind >= 2 ? 'high' : majorsBehind === 1 ? 'medium' : 'low',
          }
        })

        const highPriority = packages.filter((p) => p.priority === 'high')

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalOutdated: packages.length,
                  highPriority: highPriority.length,
                  packages: packages.sort((a, b) => b.majorsBehind - a.majorsBehind),
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

    // ── check_licenses ─────────────────────────────────────────────────────────
    case 'check_licenses': {
      try {
        const projectPath = resolve(process.cwd(), (args as Record<string, string>).projectPath ?? '.')
        const typeFilter = (args as Record<string, string>).type ?? 'all'
        const nodeModules = join(projectPath, 'node_modules')

        if (!existsSync(nodeModules)) {
          return {
            content: [{ type: 'text', text: 'node_modules not found. Run npm install first.' }],
            isError: true,
          }
        }

        const packages: {
          name: string
          version: string
          license: string
          classification: string
          flagged: boolean
        }[] = []

        for (const entry of readdirSync(nodeModules)) {
          if (entry.startsWith('.')) continue

          const pkgPath =
            entry.startsWith('@')
              ? join(nodeModules, entry)
              : join(nodeModules, entry, 'package.json')

          if (entry.startsWith('@')) {
            try {
              for (const subEntry of readdirSync(pkgPath)) {
                const subPkgJson = join(pkgPath, subEntry, 'package.json')
                try {
                  const pkg = JSON.parse(readFileSync(subPkgJson, 'utf-8'))
                  const license = pkg.license ?? pkg.licenses?.[0]?.type ?? 'UNKNOWN'
                  const cls = classifyLicense(license)
                  if (typeFilter === 'copyleft' && cls !== 'copyleft') continue
                  if (typeFilter === 'permissive' && cls !== 'permissive') continue
                  packages.push({
                    name: `@${entry}/${subEntry}`,
                    version: pkg.version ?? 'unknown',
                    license,
                    classification: cls,
                    flagged: cls === 'copyleft' || cls === 'proprietary',
                  })
                } catch { /* skip */ }
              }
            } catch { /* skip */ }
          } else {
            try {
              const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
              const license = pkg.license ?? pkg.licenses?.[0]?.type ?? 'UNKNOWN'
              const cls = classifyLicense(license)
              if (typeFilter === 'copyleft' && cls !== 'copyleft') continue
              if (typeFilter === 'permissive' && cls !== 'permissive') continue
              packages.push({
                name: entry,
                version: pkg.version ?? 'unknown',
                license,
                classification: cls,
                flagged: cls === 'copyleft' || cls === 'proprietary',
              })
            } catch { /* skip */ }
          }
        }

        const flagged = packages.filter((p) => p.flagged)
        const byLicense: Record<string, number> = {}
        for (const p of packages) {
          byLicense[p.license] = (byLicense[p.license] ?? 0) + 1
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  totalPackages: packages.length,
                  flaggedPackages: flagged.length,
                  flaggedList: flagged,
                  licenseDistribution: byLicense,
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

    // ── analyze_bundle_impact ──────────────────────────────────────────────────
    case 'analyze_bundle_impact': {
      try {
        const projectPath = resolve(process.cwd(), (args as Record<string, string>).projectPath ?? '.')
        const topN = Number((args as Record<string, unknown>).topN ?? 20)
        const nodeModules = join(projectPath, 'node_modules')

        if (!existsSync(nodeModules)) {
          return {
            content: [{ type: 'text', text: 'node_modules not found. Run npm install first.' }],
            isError: true,
          }
        }

        const packageSizes: { name: string; sizeKb: number }[] = []
        let nodeModulesTotal = 0

        for (const entry of readdirSync(nodeModules)) {
          if (entry.startsWith('.')) continue
          const full = join(nodeModules, entry)
          try {
            const stat = statSync(full)
            if (stat.isDirectory()) {
              if (entry.startsWith('@')) {
                for (const sub of readdirSync(full)) {
                  const subFull = join(full, sub)
                  const kb = getDirSizeKb(subFull)
                  packageSizes.push({ name: `@${entry}/${sub}`, sizeKb: kb })
                  nodeModulesTotal += kb
                }
              } else {
                const kb = getDirSizeKb(full)
                packageSizes.push({ name: entry, sizeKb: kb })
                nodeModulesTotal += kb
              }
            }
          } catch { /* skip */ }
        }

        packageSizes.sort((a, b) => b.sizeKb - a.sizeKb)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  nodeModulesTotal: `${Math.round(nodeModulesTotal / 1024)} MB`,
                  topPackages: packageSizes.slice(0, topN).map((p) => ({
                    ...p,
                    sizeFormatted: p.sizeKb > 1024
                      ? `${(p.sizeKb / 1024).toFixed(1)} MB`
                      : `${p.sizeKb} KB`,
                  })),
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

    // ── check_outdated ─────────────────────────────────────────────────────────
    case 'check_outdated': {
      try {
        const projectPath = resolve(process.cwd(), (args as Record<string, string>).projectPath ?? '.')
        const { stdout } = safeRunCommand('npm outdated --json', projectPath)

        if (!stdout.trim()) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ message: 'All packages are up to date.', massivelyOutdated: [] }, null, 2) }],
          }
        }

        let parsed: Record<string, { current: string; wanted: string; latest: string }> = {}
        try {
          parsed = JSON.parse(stdout)
        } catch {
          return {
            content: [{ type: 'text', text: 'Failed to parse npm outdated output.' }],
            isError: true,
          }
        }

        const massivelyOutdated = Object.entries(parsed)
          .map(([pkg, info]) => {
            const [curMajor] = parseSemver(info.current)
            const [latestMajor] = parseSemver(info.latest)
            return {
              package: pkg,
              current: info.current,
              latest: info.latest,
              majorsBehind: latestMajor - curMajor,
            }
          })
          .filter((p) => p.majorsBehind >= 2)
          .sort((a, b) => b.majorsBehind - a.majorsBehind)

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  packagesMoreThan2MajorsBehind: massivelyOutdated.length,
                  packages: massivelyOutdated,
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
