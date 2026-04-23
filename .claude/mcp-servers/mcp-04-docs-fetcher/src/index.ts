import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { DatabaseSync } from 'node:sqlite'
import { parse } from 'node-html-parser'
import path from 'path'
import fs from 'fs'

// ──────────────────────────────────────────────────────────────
// Library registry
// ──────────────────────────────────────────────────────────────

interface LibraryEntry {
  name: string
  docsUrl: string
  changelogUrl?: string
  description: string
}

const LIBRARIES: Record<string, LibraryEntry> = {
  react: {
    name: 'React',
    docsUrl: 'https://react.dev/reference/react',
    changelogUrl: 'https://github.com/facebook/react/releases',
    description: 'The library for web and native user interfaces',
  },
  nextjs: {
    name: 'Next.js',
    docsUrl: 'https://nextjs.org/docs',
    changelogUrl: 'https://github.com/vercel/next.js/releases',
    description: 'The React Framework for the Web',
  },
  vue: {
    name: 'Vue.js',
    docsUrl: 'https://vuejs.org/guide/introduction.html',
    changelogUrl: 'https://github.com/vuejs/core/releases',
    description: 'Progressive JavaScript framework',
  },
  nuxt: {
    name: 'Nuxt',
    docsUrl: 'https://nuxt.com/docs/getting-started/introduction',
    changelogUrl: 'https://github.com/nuxt/nuxt/releases',
    description: 'The Intuitive Vue Framework',
  },
  express: {
    name: 'Express',
    docsUrl: 'https://expressjs.com/en/4x/api.html',
    changelogUrl: 'https://github.com/expressjs/express/releases',
    description: 'Fast, unopinionated, minimalist web framework for Node.js',
  },
  fastify: {
    name: 'Fastify',
    docsUrl: 'https://fastify.dev/docs/latest/',
    changelogUrl: 'https://github.com/fastify/fastify/releases',
    description: 'Fast and low overhead web framework for Node.js',
  },
  fastapi: {
    name: 'FastAPI',
    docsUrl: 'https://fastapi.tiangolo.com/',
    changelogUrl: 'https://github.com/tiangolo/fastapi/releases',
    description: 'Modern, fast Python web framework',
  },
  django: {
    name: 'Django',
    docsUrl: 'https://docs.djangoproject.com/en/stable/',
    changelogUrl: 'https://github.com/django/django/releases',
    description: 'The web framework for perfectionists with deadlines',
  },
  prisma: {
    name: 'Prisma',
    docsUrl: 'https://www.prisma.io/docs/orm/reference/prisma-client-reference',
    changelogUrl: 'https://github.com/prisma/prisma/releases',
    description: 'Next-generation ORM for Node.js & TypeScript',
  },
  drizzle: {
    name: 'Drizzle ORM',
    docsUrl: 'https://orm.drizzle.team/docs/overview',
    changelogUrl: 'https://github.com/drizzle-team/drizzle-orm/releases',
    description: 'Headless TypeScript ORM with a head',
  },
  tanstackquery: {
    name: 'TanStack Query',
    docsUrl: 'https://tanstack.com/query/latest/docs/framework/react/overview',
    changelogUrl: 'https://github.com/TanStack/query/releases',
    description: 'Powerful asynchronous state management',
  },
  tailwind: {
    name: 'Tailwind CSS',
    docsUrl: 'https://tailwindcss.com/docs',
    changelogUrl: 'https://github.com/tailwindlabs/tailwindcss/releases',
    description: 'A utility-first CSS framework',
  },
  shadcn: {
    name: 'shadcn/ui',
    docsUrl: 'https://ui.shadcn.com/docs',
    description: 'Beautifully designed components built with Radix UI and Tailwind CSS',
  },
  zod: {
    name: 'Zod',
    docsUrl: 'https://zod.dev/',
    changelogUrl: 'https://github.com/colinhacks/zod/releases',
    description: 'TypeScript-first schema validation with static type inference',
  },
  trpc: {
    name: 'tRPC',
    docsUrl: 'https://trpc.io/docs',
    changelogUrl: 'https://github.com/trpc/trpc/releases',
    description: 'End-to-end typesafe APIs made easy',
  },
  vitest: {
    name: 'Vitest',
    docsUrl: 'https://vitest.dev/guide/',
    changelogUrl: 'https://github.com/vitest-dev/vitest/releases',
    description: 'Next Generation Testing Framework',
  },
  vite: {
    name: 'Vite',
    docsUrl: 'https://vitejs.dev/guide/',
    changelogUrl: 'https://github.com/vitejs/vite/releases',
    description: 'Next generation frontend tooling',
  },
  typescript: {
    name: 'TypeScript',
    docsUrl: 'https://www.typescriptlang.org/docs/',
    changelogUrl: 'https://github.com/microsoft/TypeScript/releases',
    description: 'JavaScript with syntax for types',
  },
  astro: {
    name: 'Astro',
    docsUrl: 'https://docs.astro.build/en/getting-started/',
    changelogUrl: 'https://github.com/withastro/astro/releases',
    description: 'The web framework for content-driven websites',
  },
  svelte: {
    name: 'Svelte',
    docsUrl: 'https://svelte.dev/docs',
    changelogUrl: 'https://github.com/sveltejs/svelte/releases',
    description: 'Cybernetically enhanced web apps',
  },
  remix: {
    name: 'Remix',
    docsUrl: 'https://remix.run/docs/en/main',
    changelogUrl: 'https://github.com/remix-run/remix/releases',
    description: 'Full stack web framework focused on web standards',
  },
  'react-router': {
    name: 'React Router',
    docsUrl: 'https://reactrouter.com/en/main',
    changelogUrl: 'https://github.com/remix-run/react-router/releases',
    description: 'Declarative routing for React',
  },
}

// ──────────────────────────────────────────────────────────────
// Cache (SQLite)
// ──────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function getDb(): DatabaseSync {
  const dbDir = path.join(process.cwd(), '.claude')
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(path.join(dbDir, 'docs-cache.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs_cache (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT UNIQUE NOT NULL,
      content   TEXT NOT NULL,
      url       TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cache_key ON docs_cache(cache_key);
  `)
  return db
}

interface CacheRow {
  content: string
  url: string
  cached_at: number
}

function getCached(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT content, cached_at FROM docs_cache WHERE cache_key = ?').get(key) as CacheRow | undefined
  if (!row) return null
  if (Date.now() - row.cached_at > CACHE_TTL_MS) return null
  return row.content
}

function setCache(db: DatabaseSync, key: string, content: string, url: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO docs_cache (cache_key, content, url, cached_at) VALUES (?, ?, ?, ?)'
  ).run(key, content, url, Date.now())
}

// ──────────────────────────────────────────────────────────────
// HTTP fetch helpers
// ──────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'mcp-docs-fetcher/1.0 (documentation assistant)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`)
    return await res.text()
  } finally {
    clearTimeout(id)
  }
}

function extractTextFromHtml(html: string): string {
  const root = parse(html)
  // Remove script and style tags
  root.querySelectorAll('script, style, nav, footer, .sidebar, [role="navigation"]').forEach((el) => el.remove())
  // Get main content area if available
  const main = root.querySelector('main, article, [role="main"], .content, .docs-content, #content')
  const target = main ?? root
  // Replace code blocks with markers
  let text = target.structuredText
  // Normalize whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim()
  return text
}

function searchInText(text: string, query: string, contextLines = 5): string[] {
  const lines = text.split('\n')
  const queryLower = query.toLowerCase()
  const results: string[] = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(queryLower)) {
      const start = Math.max(0, i - contextLines)
      const end = Math.min(lines.length - 1, i + contextLines)
      const snippet = lines.slice(start, end + 1).join('\n').trim()
      if (!results.includes(snippet)) results.push(snippet)
    }
  }

  return results.slice(0, 10)
}

function extractCodeExamples(html: string, pattern: string): string[] {
  const root = parse(html)
  const codeBlocks = root.querySelectorAll('pre, code')
  const patternLower = pattern.toLowerCase()
  const examples: string[] = []

  for (const block of codeBlocks) {
    const code = block.text
    if (code.toLowerCase().includes(patternLower)) {
      examples.push(code.trim())
    }
  }

  return examples.slice(0, 10)
}

function resolveLibraryKey(input: string): string | null {
  const lower = input.toLowerCase().replace(/[\s\-_.]/g, '')
  // exact match
  if (LIBRARIES[lower]) return lower
  // aliases
  const aliases: Record<string, string> = {
    'next': 'nextjs',
    'react-query': 'tanstackquery',
    'reactquery': 'tanstackquery',
    'tanstack': 'tanstackquery',
    'tw': 'tailwind',
    'shadcnui': 'shadcn',
  }
  if (aliases[lower]) return aliases[lower]
  // fuzzy: find first key that includes the query
  const key = Object.keys(LIBRARIES).find((k) => k.includes(lower) || lower.includes(k))
  return key ?? null
}

// ──────────────────────────────────────────────────────────────
// Server
// ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'mcp-docs-fetcher', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_supported_libraries',
      description: 'Returns all supported libraries with their docs URLs and descriptions.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
        required: [],
      },
    },
    {
      name: 'fetch_docs',
      description:
        'Fetches documentation for a library, with optional query to filter relevant sections. Results are cached for 24 hours.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          library: { type: 'string', description: 'Library name (e.g. "react", "nextjs", "prisma", "zod")' },
          query: { type: 'string', description: 'Optional search query to filter relevant sections from the docs' },
          url: { type: 'string', description: 'Optional: override the docs URL to fetch from' },
        },
        required: ['library'],
      },
    },
    {
      name: 'get_changelog',
      description: 'Fetches the changelog or release notes for a library from GitHub releases.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          library: { type: 'string', description: 'Library name' },
          version: { type: 'string', description: 'Optional: specific version to look for (e.g. "v4.0.0")' },
        },
        required: ['library'],
      },
    },
    {
      name: 'search_examples',
      description: 'Fetches docs for a library and returns code examples containing a specific pattern.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          library: { type: 'string', description: 'Library name' },
          pattern: { type: 'string', description: 'Code pattern to search for (e.g. "useEffect", "createServer", "z.object")' },
        },
        required: ['library', 'pattern'],
      },
    },
  ],
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  switch (name) {
    // ── list_supported_libraries ────────────────────────────────
    case 'list_supported_libraries': {
      const list = Object.entries(LIBRARIES).map(([key, lib]) => ({
        key,
        name: lib.name,
        docsUrl: lib.docsUrl,
        hasChangelog: !!lib.changelogUrl,
        description: lib.description,
      }))
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ total: list.length, libraries: list }, null, 2),
          },
        ],
      }
    }

    // ── fetch_docs ──────────────────────────────────────────────
    case 'fetch_docs': {
      const { library, query, url: overrideUrl } = args as {
        library: string
        query?: string
        url?: string
      }
      try {
        const key = resolveLibraryKey(library)
        if (!key && !overrideUrl) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Library "${library}" not found. Call list_supported_libraries to see available options.`
          )
        }

        const lib = key ? LIBRARIES[key] : { name: library, docsUrl: overrideUrl!, description: '' }
        const fetchUrl = overrideUrl ?? lib.docsUrl
        const cacheKey = `docs:${key ?? library}:${fetchUrl}`

        const db = getDb()
        let content = getCached(db, cacheKey)
        let fromCache = true

        if (!content) {
          fromCache = false
          const html = await fetchWithTimeout(fetchUrl)
          content = extractTextFromHtml(html)
          setCache(db, cacheKey, content, fetchUrl)
        }

        let result: string
        if (query) {
          const sections = searchInText(content, query)
          result = sections.length > 0
            ? sections.join('\n\n---\n\n')
            : `No sections found matching "${query}". Returning first 3000 chars.\n\n${content.slice(0, 3000)}`
        } else {
          result = content.slice(0, 6000)
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  library: lib.name,
                  url: fetchUrl,
                  fromCache,
                  query: query ?? null,
                  content: result,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `fetch_docs failed: ${(err as Error).message}`)
      }
    }

    // ── get_changelog ───────────────────────────────────────────
    case 'get_changelog': {
      const { library, version } = args as { library: string; version?: string }
      try {
        const key = resolveLibraryKey(library)
        if (!key) {
          throw new McpError(ErrorCode.InvalidRequest, `Library "${library}" not found.`)
        }

        const lib = LIBRARIES[key]
        if (!lib.changelogUrl) {
          throw new McpError(ErrorCode.InvalidRequest, `No changelog URL configured for "${lib.name}".`)
        }

        const db = getDb()
        const cacheKey = `changelog:${key}:${version ?? 'latest'}`
        let content = getCached(db, cacheKey)

        if (!content) {
          const html = await fetchWithTimeout(lib.changelogUrl)
          content = extractTextFromHtml(html)
          setCache(db, cacheKey, content, lib.changelogUrl)
        }

        let result = content
        if (version) {
          const sections = searchInText(content, version, 10)
          result = sections.length > 0 ? sections.join('\n\n---\n\n') : content.slice(0, 4000)
        } else {
          result = content.slice(0, 4000)
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ library: lib.name, changelogUrl: lib.changelogUrl, version: version ?? 'latest', content: result }, null, 2),
            },
          ],
        }
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `get_changelog failed: ${(err as Error).message}`)
      }
    }

    // ── search_examples ─────────────────────────────────────────
    case 'search_examples': {
      const { library, pattern } = args as { library: string; pattern: string }
      try {
        const key = resolveLibraryKey(library)
        if (!key) {
          throw new McpError(ErrorCode.InvalidRequest, `Library "${library}" not found.`)
        }

        const lib = LIBRARIES[key]
        const db = getDb()
        const cacheKey = `html:${key}:${lib.docsUrl}`
        let html = getCached(db, cacheKey)

        if (!html) {
          html = await fetchWithTimeout(lib.docsUrl)
          setCache(db, cacheKey, html, lib.docsUrl)
        }

        const examples = extractCodeExamples(html, pattern)

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  library: lib.name,
                  pattern,
                  totalExamples: examples.length,
                  examples,
                },
                null,
                2
              ),
            },
          ],
        }
      } catch (err) {
        if (err instanceof McpError) throw err
        throw new McpError(ErrorCode.InternalError, `search_examples failed: ${(err as Error).message}`)
      }
    }

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`)
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(console.error)
