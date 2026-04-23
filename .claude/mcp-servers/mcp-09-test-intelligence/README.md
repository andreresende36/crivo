# MCP Test Intelligence Server

> Test discovery, coverage gap analysis, test case generation, flaky test detection, and performance analysis — make your test suite smarter from Claude Code.

## When to Use

- **Coverage gaps:** `find_untested_code` identifies files below your coverage threshold
- **Test ideation:** `suggest_test_cases` reads a source file and generates test descriptions for every export
- **Flaky test hunting:** `find_flaky_tests` catches inconsistent tests that waste CI time
- **Test performance:** `get_test_performance` identifies slow tests dragging down your feedback loop
- **Test inventory:** `list_tests` gives you a complete map of your test suite

## Tools

| Tool | Description |
|------|-------------|
| `list_tests` | Finds all test files and extracts test names |
| `find_untested_code` | Reads coverage JSON and returns files below the threshold |
| `suggest_test_cases` | Reads a source file and generates test case descriptions for exports |
| `find_flaky_tests` | Reads `.claude/test_runs.jsonl` and identifies inconsistent tests |
| `get_test_performance` | Static analysis for test anti-patterns + optional live run timing |

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
    "test-intelligence": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-09-test-intelligence/src/index.ts"]
    }
  }
}
```

## Usage Examples

```
list_tests(directory="src/")
find_untested_code(threshold=85)
suggest_test_cases(filePath="src/services/auth.ts")
find_flaky_tests(historyPath=".claude/test_runs.jsonl")
get_test_performance(runTests=false)
```

## Flaky Test Tracking Format

Create `.claude/test_runs.jsonl` with one entry per line:
```json
{"name": "auth should login user", "passed": true, "duration": 45}
{"name": "auth should login user", "passed": false, "duration": 120}
```

A test is marked **flaky** if it has both `passed: true` and `passed: false` entries. The flakiness score = failures / total runs.

## Coverage Threshold Guidelines

| Project Type | Recommended Threshold |
|-------------|----------------------|
| Library/SDK | 90%+ |
| API Backend | 80%+ |
| Full-stack App | 70%+ |
| CLI Tool | 85%+ |
| Prototype/MVP | 50%+ |

## Tips

- Pipe `vitest --reporter=json` output to `.claude/test_runs.jsonl` for automatic flaky test tracking
- Combine with `mcp-07-code-quality` to correlate complex functions with missing test coverage
- Use `suggest_test_cases` when joining a new codebase — it maps testable surface area instantly
