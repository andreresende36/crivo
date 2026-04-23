# Project Context Map — crivo

## Tech Stack

- Backend: Python 3.11 + FastAPI + httpx + Playwright
- Frontend: Next.js App Router + TypeScript + Tailwind + shadcn/ui (admin/)
- Database: Supabase (PostgreSQL) + SQLite (fallback via aiosqlite)
- IA: Anthropic Claude SDK + OpenRouter (Gemini/FLUX para imagens)
- Bots: python-telegram-bot + Evolution API (WhatsApp via httpx)
- Deploy: Docker + docker-compose + VPS

## Directory Purpose

```
src/analyzer/       → Score engine puro (sem I/O) — pontua e filtra ofertas
src/api/            → FastAPI — endpoints REST internos
src/database/       → supabase_client, sqlite_fallback, storage_manager
src/distributor/    → Formatadores e senders (Telegram + WhatsApp)
src/image/          → Geração de imagens lifestyle via IA (OpenRouter)
src/monitoring/     → AlertBot, MonitorState, health checks
src/scraper/        → base_scraper + ml_scraper (Playwright + httpx)
src/utils/          → Helpers transversais
src/workers/        → Background workers (pipeline de scraping, sender)
admin/src/app/      → Next.js App Router — rotas e Server Actions do painel
supabase/           → Migrations SQL + Edge Functions
tests/              → pytest — unit, integration, live
scripts/            → Utilitários (reset_databases, seeds)
prompts/            → Templates de texto para IA
```

## Known Issues / Quirks

- ML_SESSION_COOKIES expiram a cada ~30 dias — AlertBot notifica quando precisa renovar
- SQLite fallback: algumas queries Supabase-específicas não têm equivalente SQLite
- StorageManager é singleton — não criar múltiplas instâncias no mesmo processo
- Playwright requer Chromium instalado (`playwright install chromium`)
- `USE_REDIS_STATE=false` por padrão — Redis só é necessário em deploy multi-container

## Performance Considerations

- Scraper usa delays aleatórios (SCRAPER_DELAY_MIN/MAX) para evitar bloqueio
- Score engine executa em memória pura — não é gargalo
- Geração de imagem via OpenRouter é a operação mais lenta (~5-15s por imagem)
- Supabase tem rate limit nas queries — usar batch inserts quando possível
- Playwright headless usa ~200MB RAM por instância — não paralelizar sem controle
