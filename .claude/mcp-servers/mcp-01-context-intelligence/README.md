# MCP Context Intelligence Server

> Symbol-level context intelligence for your codebase — find, annotate, and explore symbols with persistent observations.

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your `.claude/settings.json` (or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "context-intelligence": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-01-context-intelligence/dist/index.js"],
      "cwd": "/your/project/root"
    }
  }
}
```

For development (no build needed):

```json
{
  "mcpServers": {
    "context-intelligence": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-01-context-intelligence/src/index.ts"],
      "cwd": "/your/project/root"
    }
  }
}
```

## Tools

### `get_symbol_context`

Reads a source file, locates a symbol (function/class/variable/interface/type), returns:
- Exact code block
- Line range
- All saved observations from the context database

```
get_symbol_context(filePath: "src/auth/service.ts", symbolName: "validateToken")
```

### `add_observation`

Saves a note about a symbol to the local SQLite database (`.claude/context.db`):

```
add_observation(symbol: "validateToken", note: "This function checks JWT expiry but does NOT verify the signature — see issue #142", filePath: "src/auth/service.ts")
```

### `get_project_summary`

Walks the project directory and returns:
- File counts by extension
- README.md and CLAUDE.md previews
- Package name, version, dependencies

```
get_project_summary(rootDir: ".")
```

### `find_dependents`

Finds all source files that import or reference a given symbol:

```
find_dependents(symbolName: "UserRepository", rootDir: "src")
```

### `search_symbols`

Greps across the codebase for function/class/const declarations matching a query:

```
search_symbols(query: "Auth", fileExtensions: [".ts", ".tsx"])
```

## Data Storage

Observations are stored in `.claude/context.db` (SQLite) relative to the `cwd` passed when starting the server.  
Add `.claude/*.db` to your `.gitignore`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run with `tsx` (no build needed) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
