# MCP Code Quality Analyzer

> Cyclomatic complexity analysis, code smell detection, duplicate finding, and circular dependency graphs — automated quality checks from Claude Code.

## When to Use

- **Code review automation:** Run `get_quality_score` on PRs to get a 0–100 score
- **Refactoring targets:** `analyze_complexity` finds the most complex functions to simplify
- **Architecture health:** `find_circular_deps` reveals import cycles that indicate poor module boundaries
- **DRY enforcement:** `find_duplicates` catches copy-paste code before it accumulates
- **Pre-merge gates:** Add to CLAUDE.md hooks to block merges below quality threshold

## Tools

| Tool | Description |
|------|-------------|
| `analyze_complexity` | Calculates cyclomatic complexity per function in a file |
| `find_code_smells` | Detects god classes, long methods, too many params, too many exports |
| `find_duplicates` | Finds identical or near-identical code blocks across a directory |
| `find_circular_deps` | Analyzes import graph and detects cyclic dependencies |
| `get_quality_score` | Aggregates all metrics into a 0–100 quality score with grade |

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
    "code-quality": {
      "command": "npx",
      "args": ["tsx", "/path/to/mcp-07-code-quality/src/index.ts"]
    }
  }
}
```

## Usage Examples

```
analyze_complexity(filePath="src/services/userService.ts")
find_code_smells(directory="src/")
find_duplicates(directory="src/", minLines=6)
find_circular_deps(entryFile="src/index.ts")
get_quality_score(directory="src/")
```

## Complexity Scale

- **1–5**: Low — good
- **6–10**: Moderate — acceptable
- **11–20**: High — refactor recommended
- **21+**: Critical — refactor required

## Quality Score Breakdown

| Metric | Weight | What It Measures |
|--------|--------|------------------|
| Complexity | 30% | Average cyclomatic complexity across all functions |
| Code Smells | 25% | God classes, long methods, too many params |
| Duplicates | 20% | Percentage of duplicated code blocks |
| Circular Deps | 15% | Number of import cycles |
| File Size | 10% | Files exceeding reasonable line counts |

## Tips

- Run `get_quality_score` weekly and track the trend — quality drift is invisible until it hurts
- Configure `find_code_smells` thresholds in your CLAUDE.md: `maxMethodLines: 50`, `maxParams: 5`
- Combine with `mcp-09-test-intelligence` to correlate low-quality files with low test coverage
