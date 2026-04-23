# MCP Dependency Security Scanner

> Vulnerability scanning, license auditing, outdated package detection, and bundle impact analysis — security-first dependency management from Claude Code.

## When to Use

- **Security audits:** `scan_vulnerabilities` before every deployment to catch known CVEs
- **License compliance:** `check_licenses` flags copyleft dependencies that could force open-sourcing
- **Dependency hygiene:** `suggest_updates` + `check_outdated` keep your stack current
- **Bundle optimization:** `analyze_bundle_impact` reveals which packages bloat your `node_modules`
- **CI/CD integration:** Add to pre-merge checks via CLAUDE.md hooks

## Tools

| Tool | Description |
|------|-------------|
| `scan_vulnerabilities` | Runs `npm audit` or `pip-audit`, returns structured vulnerability list |
| `suggest_updates` | Runs `npm outdated`, returns packages with current/wanted/latest versions |
| `check_licenses` | Reads `node_modules` licenses and flags copyleft/proprietary ones |
| `analyze_bundle_impact` | Measures disk footprint of each package in `node_modules` |
| `check_outdated` | Returns packages that are 2+ major versions behind |

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
    "dependency-scanner": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-08-dependency-scanner/src/index.ts"]
    }
  }
}
```

## Usage Examples

```
scan_vulnerabilities(projectPath="/my/project", type="npm")
suggest_updates(projectPath="/my/project")
check_licenses(type="copyleft")
analyze_bundle_impact(topN=30)
check_outdated()
```

## License Risk Classification

- **Permissive** (MIT, Apache, BSD, ISC): ✅ Safe for commercial use
- **Copyleft** (GPL, AGPL, LGPL): ⚠️ May require open-sourcing your code
- **Proprietary** (UNLICENSED): ❌ No redistribution rights

## Vulnerability Severity Levels

| Level | Action | SLA |
|-------|--------|-----|
| Critical | Patch immediately — active exploits likely | 24h |
| High | Patch in current sprint | 1 week |
| Moderate | Schedule for next release | 2 weeks |
| Low | Track, no urgency | Backlog |

## Tips

- Run `scan_vulnerabilities` as a CLAUDE.md pre-commit hook for zero-CVE policy
- Use `analyze_bundle_impact(topN=10)` to find the heaviest deps — often a lighter alternative exists
- Schedule `check_outdated` monthly to avoid falling behind on major versions
