# PROJECT CONTEXT

- Repository: crivo
- Current Phase: feature
- Repo URL: git@github.com:andreresende36/crivo.git

## STACK

```bash
Auth:       bcrypt (hash de senha) + Supabase RLS (autorização)
Backend:    Python 3.11 + FastAPI 0.110 + httpx (async) + Playwright
Database:   Supabase (PostgreSQL) + SQLite (fallback via aiosqlite)
Deploy:     Docker + Docker Compose + VPS
Frontend:   Next.js (App Router) + TypeScript + Tailwind + shadcn/ui  [admin/]
Monorepo:   não (subpastas independentes — admin/ é serviço separado)
Tests:      pytest 8.x + pytest-asyncio + pytest-mock + respx
AI/LLM:     Anthropic Claude (SDK) + OpenRouter (Gemini/FLUX para imagens)
Bots:       python-telegram-bot 21.x + Evolution API (WhatsApp via httpx)
```

## PROJECT STRUCTURE

```bash
crivo/
├── src/
│   ├── analyzer/       # Score engine — pontua e filtra ofertas
│   ├── api/            # FastAPI — endpoints REST internos
│   ├── database/       # supabase_client, sqlite_fallback, storage_manager
│   ├── distributor/    # Telegram + WhatsApp message formatters/senders
│   ├── image/          # Geração de imagens lifestyle via IA (OpenRouter)
│   ├── monitoring/     # AlertBot, MonitorState, health checks
│   ├── scraper/        # base_scraper + ml_scraper (Playwright/httpx)
│   ├── utils/          # Helpers transversais
│   └── workers/        # Background workers (scraping pipeline, sender)
├── admin/              # Next.js App Router — painel de admin
│   └── src/app/        # Rotas, Server Actions, componentes
├── supabase/           # Migrations SQL + Edge Functions
├── tests/              # pytest — unit, integration, live
├── scripts/            # Scripts utilitários (reset_databases, seeds)
├── prompts/            # Prompts de IA (templates de texto)
├── data/               # SQLite local (crivo.db)
├── logs/               # Logs de execução
├── debug/              # Screenshots e HTML de debug do scraper
└── chrome-extension/   # Extensão Chrome (popup de afiliados)
```

## ARCHITECTURE RULES

- Pattern: `worker → scraper → analyzer → database → distributor`
- Scraper nunca escreve no banco diretamente — passa pelo `StorageManager`
- `StorageManager` decide entre Supabase e SQLite fallback
- Score engine (`score_engine.py`) é puro — sem I/O, apenas cálculo
- Distributor não busca dados do banco — recebe ofertas prontas via parâmetro
- Toda chamada de rede usa `httpx` async ou `playwright` — NUNCA `requests` sync
- Configuração centralizada em `src/config.py` lida via `python-dotenv`
- ALWAYS validar inputs em endpoints FastAPI com Pydantic schemas
- ALWAYS usar `await` em qualquer chamada async — nunca `.execute()` sem await
- NEVER colocar lógica de negócio em routers FastAPI — usar service layer

## CONVENTIONS

### Naming

```bash
Files:       snake_case — score_engine.py, ml_scraper.py
Classes:     PascalCase — StorageManager, ScoreEngine, MLScraper
Functions:   snake_case — get_offers, calculate_score, send_telegram
Constants:   UPPER_SNAKE — MAX_RETRIES, SCRAPER_DELAY_MIN
DB tables:   snake_case plural — products, offers, price_history
DB columns:  snake_case — created_at, is_active, affiliate_url
Env vars:    UPPER_SNAKE — SUPABASE_URL, TELEGRAM_BOT_TOKEN
Admin (TS):  camelCase funções, PascalCase componentes/classes, kebab-case arquivos
```

### Git

```bash
Branches:    feat/*, fix/*, refactor/*, chore/*
Commits:     Conventional Commits — feat: add score weight redistribution
PR scope:    uma feature ou fix por PR, máx ~400 linhas alteradas
```

### Code Style

- Máximo 40 linhas por função — extrair helpers se ultrapassar
- Um componente/classe por arquivo
- Sem `from __future__ import annotations` — quebra Pydantic v2 em runtime
- Prefer `X | None` em vez de `Optional[X]` (Python 3.10+)
- No admin Next.js: empurrar `"use client"` para folhas da árvore de componentes

## TRIGGERS

| Trigger | Action |
| --- | --- |
| Any architectural decision | Write rationale to `docs/decisions/YYYY-MM-DD-topic.md` BEFORE responding |
| Any code change | Run quality gates (tests, types, lint) before reporting completion |
| Any database change | Check for pending migrations in `supabase/migrations/`; create new migration |
| Bug encountered | Document root cause, fix, and prevention in session state |
| Creating new module/service | Check if existing one in `src/` can be extended first |
| New scraper source needed | Extend `BaseScraper` — NEVER duplicate scraping logic |
| Session start | Read `memory/wake-up.md` for context on current state |
| Session end | Update `memory/wake-up.md` with what was done, next steps, blockers |
| Task completed | Update CURRENT STATE section below with progress |

## FORBIDDEN PATTERNS

- NEVER commit `.env` — usar `.env.example` com valores placeholder
- NEVER usar `requests` sync — sempre `httpx` async ou `playwright`
- NEVER criar novo scraper sem estender `BaseScraper`
- NEVER colocar lógica de scoring fora de `score_engine.py`
- NEVER ignorar testes falhando — corrigir antes de continuar
- NEVER logar senhas, tokens, API keys ou PII
- NEVER modificar migrations já aplicadas — criar nova migration
- NEVER pular validação de input em endpoints FastAPI
- NEVER usar `any` em TypeScript (admin) sem comentário justificando
- NEVER enfileirar jobs dentro de transactions de banco de dados
- NEVER SELECT * em queries — sempre especificar colunas

## CURRENT STATE

- Last session: 2026-04-22 — setup Claude Code Elite via initial-setup
- In progress: tudo que estava desenvolvido continua funcionando
- Next: a definir
- Blockers: nenhum

## MEMORY STRUCTURE

```bash
docs/decisions/              → Architectural Decision Records (ADR)
docs/decisions/template.md   → ADR template
memory/wake-up.md            → Session handoff: current state, next steps, blockers
memory/persistent.md         → Immutable project facts (tech choices, external API contracts)
memory/journal/              → Diário de sessão YYYY-MM-DD.md
```

## MEMORY MANAGEMENT RULES

### Session Start (MANDATORY)

Read wake-up.md as your FIRST action. Do not start work without doing this.

### During Session (MANDATORY)

When ANY of these happen, write to the appropriate file IMMEDIATELY:

- Architectural decision made → decisions/YYYY-MM-DD.md
- Bug found and fixed → journal/TODAY.md under "Bugs"
- Insight about codebase → memory/persistent.md
- Change in approach → wake-up.md update

### Session End (MANDATORY)

Before ending:

1. Update journal/YYYY-MM-DD.md with today's work summary
2. Rewrite wake-up.md with fresh handoff for next session
3. Remove from wake-up.md anything that's resolved or no longer relevant

## QUALITY GATES

```bash
□ Tests pass             → .venv/bin/pytest tests/ -x --tb=short
□ Type check passes      → mypy src/  (Python) | npx tsc --noEmit (admin/)
□ Linter passes          → ruff check . && ruff format --check .
□ No hardcoded secrets   → grep para API keys, passwords, tokens
□ ADR written            → se qualquer decisão arquitetural foi tomada
□ Session state updated  → memory/wake-up.md reflete realidade atual
```

## ENV VARS

> Arquivo completo: `.env.example` (50+ vars documentadas).
> Vars críticas:

```env
SUPABASE_URL=               # URL do projeto Supabase
SUPABASE_SERVICE_ROLE_KEY=  # Chave de service role (backend)
TELEGRAM_BOT_TOKEN=         # Token do bot principal
OPENROUTER_API_KEY=         # LLM + geração de imagens
ML_SESSION_COOKIES=         # Cookies de sessão ML (expiram ~30 dias)
APP_ENV=                    # development | production
```

> **Regra:** toda var usada no código DEVE estar em `.env.example`.

## COMMANDS

```bash
/deploy-check    → Run ALL quality gates. List failures. Offer automated fix for each.
/refactor [file] → Analyze file against architecture rules. Propose aligned refactors.
/review          → Analyze all files changed this session. List every CLAUDE.md violation.
/status          → Read CURRENT STATE → report: (1) done, (2) in progress, (3) blockers, (4) recommended priority.
/test            → Run test suite. On failure: analyze → fix → re-run. Repeat until green.
```

## TASK WORKFLOW

1. **Orient** — Read `memory/wake-up.md`. Understand current state before acting.
2. **Clarify** — If requirements are ambiguous, ask ONE focused question. Do not assume.
3. **Plan** — State approach in 2–4 bullet points. Wait for approval on complex tasks.
4. **Implement** — Write code. Follow architecture rules and conventions strictly.
5. **Verify** — Run quality gates. Fix issues before reporting completion.
6. **Report** — Show the diff summary. Ask if you should continue to the next task.
7. **Update** — Update `memory/wake-up.md` and CURRENT STATE if session is ending.

## ERROR RECOVERY

- Test fails after change → revert, analyze failure, retry with fix.
- Supabase unavailable → StorageManager deve usar SQLite fallback automaticamente.
- ML cookies expirados → AlertBot notifica admin; scraper pausa até renovação.
- Context lost mid-task → re-read `memory/wake-up.md` + arquivos relevantes de `src/`.
- Unsure about existing behavior → read tests first, then implementation. Never guess.

## CONTEXT MANAGEMENT

- Read only files relevant to the current task.
- Explore unfamiliar code via tests + type definitions first.
- Summarize findings into `memory/wake-up.md` before context fills up.
- Prefer targeted grep over recursive directory reads.

## PERSONA

- Você é senior engineer no time do Crivo.
- Estilo: direto, sem rodeios — código antes de longas explicações.
- Em dúvida, pergunte antes de assumir.
- Ao completar tarefa, mostre o diff e pergunte se deve continuar.

<!-- BEGIN:backend/02-python-fastapi.md -->
# PROJECT: Python REST API (FastAPI)

## STACK (FastAPI annex)

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11 | Runtime |
| FastAPI | 0.110 | HTTP framework |
| httpx | 0.27+ | Async HTTP client (scraping + testes) |
| Pydantic | v2 | Validação de schemas de request/response |
| pytest | 8.x | Test runner |
| ruff | 0.9+ | Linting + formatting |
| mypy | 1.14+ | Static type checking |
| bcrypt | 4.x | Password hashing |

## ARCHITECTURE RULES (FastAPI)

- **Router → Service → Repository** — nunca pular camadas
- Routers contêm APENAS declarações de path e injeção de dependências
- Services contêm lógica de negócio — NEVER importar `Request`/`Response` aqui
- Repositories contêm APENAS queries — sem `if/else` de lógica
- Todos os endpoints são `async def`; I/O síncrono usa `run_in_executor`
- Models e Schemas são SEPARADOS — nunca expor ORM objects diretamente
- Schemas usam `model_config = ConfigDict(from_attributes=True)`

## QUALITY GATES (FastAPI)

- `ruff check . && ruff format --check .` — zero issues
- `mypy src/` — nenhum `type: ignore` sem comentário explicando
- `pytest -x --tb=short` — zero falhas
- Toda migration nova testada: apply + downgrade -1
- Nenhuma chamada DB síncrona dentro de `async def` — sempre `await`
- Secrets sourced from `config.py` / `.env` — nunca hardcoded

## FORBIDDEN (FastAPI)

- NEVER `async def` route que bloqueia em I/O síncrono sem `run_in_executor`
- NEVER compartilhar `AsyncSession` entre múltiplos requests
- NEVER `Union[X, None]` — usar `X | None` (Python 3.10+)
- NEVER `global` variables para estado compartilhado — usar dependency injection
- NEVER ignorar erros mypy com `# type: ignore` em branco — corrigir os tipos
<!-- END:backend/02-python-fastapi.md -->

<!-- BEGIN:frontend/03-nextjs-app-router.md -->
# PROJECT: Next.js App Router (admin/)

> Aplica-se ao subdiretório `admin/` — painel de administração

## STACK (Next.js annex)

| Camada | Tecnologia |
|--------|-----------|
| Framework | Next.js App Router |
| Linguagem | TypeScript (strict) |
| Database | Supabase JS Client (`@supabase/ssr`) |
| Auth | Supabase Auth (SSR) |
| Styling | Tailwind CSS + shadcn/ui |
| State | Server Components + TanStack Query |

## COMPONENT STRATEGY

```
Server Component (DEFAULT — sem "use client")
  ✅ async/await direto | ✅ Acesso a Supabase, env vars
  ❌ Sem hooks, sem eventos, sem browser APIs

Client Component ("use client" no topo)
  ✅ useState, useEffect, onClick | ✅ TanStack Query
  ❌ Sem acesso direto a Supabase server secrets

REGRA: Empurre "use client" para as FOLHAS da árvore.
```

## ROUTING TABLE (Next.js)

| Trigger | Action |
|---------|--------|
| New feature | Server/Client split → route group → page.tsx + actions.ts |
| Hydration error | Encontrar boundary "use client" — mover para leaf component |
| Auth on page | middleware.ts matcher + session check no Server Component layout |
| Mutation | Server Action → Zod validation → Supabase → revalidatePath |

## QUALITY GATES (Next.js admin)

- `next build` — 0 errors, 0 warnings
- `npx tsc --noEmit` — 0 errors
- Server Actions validam com Zod antes de qualquer operação DB
- `loading.tsx` existe para rotas com dados async

## FORBIDDEN (Next.js)

- NEVER `pages/api/` — usar `app/api/route.ts`
- NEVER fetch data em Client Component no mount — Server Component ou TanStack Query
- NEVER `<img>` — sempre `next/image`
- NEVER DB credentials em `NEXT_PUBLIC_*` env vars
- NEVER `useEffect` para fetch inicial — Server Component trata isso
<!-- END:frontend/03-nextjs-app-router.md -->

<!-- BEGIN:domain-pointer:queues-jobs -->
## DOMAIN: Filas e Background Jobs (data-pipeline)

Context file: `.claude/context/domains/queues-jobs.md` — regras, invariantes e padrões arquiteturais para o pipeline de scraping, workers e distribuição. Leia ao tocar qualquer código em `src/workers/`, `src/scraper/`, `src/distributor/` ou qualquer lógica de retry/backoff.
<!-- END:domain-pointer:queues-jobs -->

<!-- BEGIN:annexes/mcp-context-usage.md -->
## MCP CONTEXT USAGE

When working with any function or class:

1. FIRST call `get_symbol_context(symbolName)` to see what you already know
2. After making observations, call `add_observation(symbolName, "your insight")`
3. Start sessions with `get_project_summary()` for orientation

This saves 60%+ in tokens because you won't re-read files you already indexed.

> Annex appended because `mcp-01-context-intelligence` was selected during initial-setup.
<!-- END:annexes/mcp-context-usage.md -->
