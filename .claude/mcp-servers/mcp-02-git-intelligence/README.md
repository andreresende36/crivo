# MCP Git Intelligence Server

> Deep git history exploration — file history, blame, commit diffs, regression detection, and activity reports.

## Installation

```bash
npm install
npm run build
```

## Requirements

- Git must be installed and available in `PATH`
- The `cwd` must point to a valid git repository (or a subdirectory of one)

## Configuration

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "git-intelligence": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-02-git-intelligence/dist/index.js"],
      "cwd": "/your/git/repo/root"
    }
  }
}
```

## Tools

### `get_file_history`

Returns commit history for a file, following renames (`--follow`):

```
get_file_history(filePath: "src/controllers/userController.ts", limit: 15)
```

Returns: hash, date, author, commit message for each commit.

### `get_commit_diff`

Returns the full diff for a commit hash:

```
get_commit_diff(commitHash: "a3f8c21")
```

Returns: author, date, message, stat summary, and full diff.

### `blame_line`

Returns blame information for a specific line — who last modified it and when:

```
blame_line(filePath: "src/auth/middleware.ts", lineNumber: 47)
```

Returns: hash, author, email, timestamp, commit message, line content.

### `find_regression`

Finds recent commits that touched a test file — useful for locating regression introduction:

```
find_regression(testFile: "src/__tests__/auth.test.ts", limit: 20)
```

Returns commits in reverse-chronological order. Review oldest-to-newest to find the regression commit.

### `get_recent_activity`

Returns all commits from the last N days with stats:

```
get_recent_activity(days: 14, author: "john@example.com")
```

Returns: hash, date, author, message, and changed files summary for each commit.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run with `tsx` (no build) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled output |
