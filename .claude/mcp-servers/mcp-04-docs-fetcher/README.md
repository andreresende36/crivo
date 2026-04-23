# MCP Documentation Fetcher Server

> Fetch, cache, and search documentation for 22+ libraries. Never leave your editor again.

## Installation

```bash
npm install
npm run build
```

## Configuration

Add to your `.claude/settings.json`:

```json
{
  "mcpServers": {
    "docs-fetcher": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-04-docs-fetcher/dist/index.js"],
      "cwd": "/your/project/root"
    }
  }
}
```

## Supported Libraries (22+)

| Key | Library | Key | Library |
|-----|---------|-----|---------|
| `react` | React | `vue` | Vue.js |
| `nextjs` | Next.js | `nuxt` | Nuxt |
| `express` | Express | `fastify` | Fastify |
| `fastapi` | FastAPI | `django` | Django |
| `prisma` | Prisma | `drizzle` | Drizzle ORM |
| `tanstackquery` | TanStack Query | `tailwind` | Tailwind CSS |
| `shadcn` | shadcn/ui | `zod` | Zod |
| `trpc` | tRPC | `vitest` | Vitest |
| `vite` | Vite | `typescript` | TypeScript |
| `astro` | Astro | `svelte` | Svelte |
| `remix` | Remix | `react-router` | React Router |

## Tools

### `list_supported_libraries`

Returns all supported libraries with docs URLs:

```
list_supported_libraries()
```

### `fetch_docs`

Fetches documentation page and optionally filters to relevant sections. Cached for 24 hours in `.claude/docs-cache.db`:

```
fetch_docs(library: "zod", query: "object schema optional fields")
fetch_docs(library: "react", query: "useEffect cleanup")
fetch_docs(library: "prisma", query: "relation queries include")
fetch_docs(library: "custom", url: "https://mylib.dev/docs")
```

### `get_changelog`

Fetches release notes from GitHub:

```
get_changelog(library: "nextjs")
get_changelog(library: "react", version: "v19")
```

### `search_examples`

Searches docs for code examples containing a specific pattern:

```
search_examples(library: "tanstackquery", pattern: "useQuery")
search_examples(library: "drizzle", pattern: "db.select()")
search_examples(library: "zod", pattern: "z.object")
```

## Caching

Documentation is cached in `.claude/docs-cache.db` (SQLite) for **24 hours**.  
Add `.claude/*.db` to `.gitignore`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Run with `tsx` (no build) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled output |
