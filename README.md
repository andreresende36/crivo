# Crivo 🖤

> **"Todo dia é Black Friday"** — Sistema automatizado de caça de ofertas para os grupos *Sempre Black* no WhatsApp e Telegram.

## O que é

O Crivo monitora continuamente o Mercado Livre, filtra ofertas genuínas com regras e IA, e publica automaticamente nos grupos com links de afiliado. Inclui um painel admin completo para gerenciar ofertas, fila de envio e acompanhar métricas.

**Pipeline principal:**
```
Mercado Livre → Scraper → Dedup → Fake Filter → Score Engine → DB → Afiliado → Telegram + WhatsApp
```

---

## Stack

| Componente | Tecnologia |
|---|---|
| Scraping | Playwright + BeautifulSoup + lxml |
| Classificação de categoria | OpenRouter (Gemini 2.5 Flash) |
| Geração de títulos | OpenRouter (Claude Haiku 4.5) |
| Geração de imagens lifestyle | OpenRouter (modelo configurável via `LIFESTYLE_IMAGE_MODEL`) |
| Banco principal | Supabase (PostgreSQL) |
| Banco fallback | SQLite local (dual-write + sync automático) |
| Estado compartilhado | Redis (inter-container via `USE_REDIS_STATE`) |
| API Backend | FastAPI + Uvicorn |
| Painel Admin | Next.js 16.2 + React 19 + TypeScript + Tailwind CSS + shadcn/ui |
| Telegram | python-telegram-bot v21 |
| WhatsApp | Evolution API |
| Servidor | VPS Hostinger + Docker Compose (4 containers: redis, scraper, sender, api, admin) |

---

## Estrutura do Projeto

```
crivo/
├── src/
│   ├── runner.py                      # Runner monolítico (dev local — substitua por workers em prod)
│   ├── config.py                      # Settings singleton (seções tipadas, lê .env)
│   ├── logging_config.py              # Logging estruturado com structlog + rich + cores
│   │
│   ├── workers/                       # Entry points isolados por container (Docker)
│   │   ├── api_worker.py              # Container `api` — serve FastAPI na porta 8000
│   │   ├── scraper_worker.py          # Container `scraper` — pipeline a cada SCRAPER_INTERVAL
│   │   └── sender_worker.py           # Container `sender` — envio temporal (8h-23h BRT)
│   │
│   ├── api/
│   │   ├── monitor.py                 # FastAPI app (CORS, health, state via Redis)
│   │   └── admin.py                   # Endpoints admin (CRUD ofertas, fila, analytics)
│   │
│   ├── scraper/
│   │   ├── base_scraper.py            # Anti-bloqueio completo (UA rotation, delays, stealth)
│   │   ├── ml_scraper.py              # Scraper ML — Ofertas do Dia, paginação, debug
│   │   ├── ml_classifier.py           # Classificador de categorias (keywords + fallback LLM)
│   │   └── pipeline.py                # Pipeline de scraping (scrape → fake filter → dedup → score → save)
│   │
│   ├── analyzer/
│   │   ├── score_engine.py            # Score 0-100 pts (7 critérios, pesos dinâmicos)
│   │   ├── fake_discount_detector.py  # Detector de pricejacking (5 heurísticas)
│   │   └── card_debugger.py           # Relatório HTML com screenshots dos rejeitados
│   │
│   ├── distributor/
│   │   ├── sender.py                  # Envio de ofertas com distribuição temporal
│   │   ├── message_formatter.py       # Templates de mensagem (Style Guide v3) para Telegram e WhatsApp
│   │   ├── message_validator.py       # Checklist de validação pré-envio (conformidade ao template)
│   │   ├── title_generator.py         # Gerador de títulos catchy via Claude Haiku (7 fórmulas)
│   │   ├── affiliate_links.py         # Builder de links ML com cache em DB
│   │   ├── ml_affiliate_api.py        # Wrapper da API de afiliados do ML
│   │   ├── telegram_bot.py            # Publicação nos grupos do Telegram
│   │   ├── title_review_bot.py        # Revisão interativa de títulos via Telegram
│   │   └── whatsapp_notifier.py       # Publicação nos grupos do WhatsApp
│   │
│   ├── image/
│   │   ├── lifestyle_generator.py     # Geração de imagens lifestyle (2 passos: análise Claude → geração)
│   │   └── image_storage.py           # Upload/recuperação de imagens via Supabase Storage
│   │
│   ├── database/
│   │   ├── storage_manager.py         # Failover automático Supabase → SQLite
│   │   ├── supabase_client.py         # Cliente async PostgreSQL via Supabase
│   │   ├── sqlite_fallback.py         # Mirror local + coluna `synced` para sync offline
│   │   ├── schema.sql                 # Schema principal (5 tabelas)
│   │   ├── seeds.py                   # Dados canônicos: badges, categorias, marketplaces
│   │   ├── title_examples.py          # Dataclasses para sistema de feedback de títulos
│   │   └── exceptions.py              # SQLiteError, SupabaseError
│   │
│   ├── monitoring/
│   │   ├── alert_bot.py               # Alertas para chat admin via Telegram Bot API
│   │   ├── health_check.py            # Health check de todos os serviços externos
│   │   ├── redis_state.py             # Estado compartilhado entre containers via Redis
│   │   └── state.py                   # Estado do monitor (timers, status — local ou Redis)
│   │
│   └── utils/
│       └── password.py                # Hash de senhas (bcrypt)
│
├── admin/                             # Painel admin (Next.js 16.2 + React 19)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx             # Root layout (Inter font, ThemeProvider)
│   │   │   ├── login/page.tsx         # Login via Supabase Auth
│   │   │   └── (dashboard)/           # Route group autenticado
│   │   │       ├── layout.tsx         # Sidebar + Header
│   │   │       ├── page.tsx           # Dashboard (KPIs, top deals, status)
│   │   │       ├── offers/page.tsx    # CRUD de ofertas com DataTable
│   │   │       ├── queue/page.tsx     # Fila drag-and-drop
│   │   │       ├── monitor/           # Monitor do sistema (status dos workers, logs)
│   │   │       ├── analytics/page.tsx # Analytics (métricas e gráficos)
│   │   │       └── settings/page.tsx  # Configurações do sistema
│   │   ├── components/
│   │   │   ├── ui/                    # Componentes shadcn/ui
│   │   │   ├── layout/               # Sidebar, Header, MobileNav, ThemeToggle
│   │   │   └── common/               # ScoreCircle, KpiCard
│   │   ├── hooks/                     # useSupabase, useAdminApi
│   │   ├── lib/
│   │   │   ├── supabase/             # Clientes browser + server
│   │   │   ├── api.ts                # Wrapper para FastAPI
│   │   │   ├── types.ts              # Interfaces TypeScript
│   │   │   └── utils.ts              # Formatadores (moeda, data, score)
│   │   └── middleware.ts              # Auth redirect
│   ├── package.json
│   └── .env.local                     # Credenciais Supabase + URL FastAPI
│
├── supabase/migrations/               # 21 migrations SQL
├── tests/
├── debug/rejected/                    # Relatórios HTML (gitignored)
├── docker-compose.yml                 # 5 serviços: redis, scraper, sender, api, admin
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## Setup — Inicio Rapido

### 1. Pre-requisitos

- Python 3.11+
- Node.js 22+ (para o painel admin)
- [`uv`](https://docs.astral.sh/uv/) (gerencia workspace Python) — `brew install uv`
- [`pnpm`](https://pnpm.io/) 10+ (gerencia workspace TS) — `brew install pnpm` ou `corepack enable`
- Docker + Docker Compose (recomendado para produção)
- Conta no [Supabase](https://supabase.com) (gratuita)
- [`supabase` CLI](https://supabase.com/docs/guides/cli) (para codegen de tipos) — `brew install supabase/tap/supabase`
- Bot no Telegram (via [@BotFather](https://t.me/BotFather))
- Chave do [OpenRouter](https://openrouter.ai) (classificação de categoria + geração de títulos + imagens)

### 2. Clonar e instalar

```bash
git clone <repo-url>
cd crivo

# Backend Python (uv workspace)
uv sync                       # cria .venv na raiz com packages/backend + packages/py-types
uv run playwright install chromium

# Painel Admin + pacotes TS (pnpm workspace)
pnpm install                  # instala @crivo/admin + @crivo/types + instala git hooks
pnpm --filter "@crivo/types" build
```

**Monorepo:** `packages/backend` (Python), `packages/admin` (Next.js), `packages/types-ts` (`@crivo/types`), `packages/py-types` (`crivo-types`). Tipos TS e Pydantic são gerados do schema Supabase — ver `pnpm codegen`.

### 3. Configurar ambiente

```bash
# Backend
cp .env.example .env
# Editar .env com suas credenciais (ver secao "Variaveis de Ambiente")

# Admin
cp admin/.env.local.example admin/.env.local
# Editar admin/.env.local com URL e chave do Supabase
```

**Backend (`.env`)** — variaveis obrigatorias:
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_GROUP_IDS`
- `OPENROUTER_API_KEY`

**Admin (`admin/.env.local`):**
- `NEXT_PUBLIC_SUPABASE_URL` — URL do projeto Supabase
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` — chave publica do Supabase (formato `sb_publishable_...`)
- `NEXT_PUBLIC_FASTAPI_URL` — URL da API (padrao: `http://localhost:8000`)

> As credenciais do Supabase ficam em **Supabase Dashboard → Settings → API** (Project URL e Project API keys).

### 4. Inicializar banco de dados

No Supabase Dashboard → SQL Editor, executar nesta ordem:

1. `src/database/schema.sql` — schema principal (5 tabelas)
2. `supabase/migrations/018_admin_panel_schema.sql` — tabela admin_settings, colunas extras, views e RPCs
3. Migrations 019-021 (title_examples, gender, installment/brand) — aplicar em ordem

### 5. Criar usuario admin

O painel admin usa Supabase Auth. Crie um usuario via Supabase Dashboard → Authentication → Users → Add User, ou via API:

```bash
curl -X POST 'https://<seu-projeto>.supabase.co/auth/v1/admin/users' \
  -H 'apikey: <SERVICE_ROLE_KEY>' \
  -H 'Authorization: Bearer <SERVICE_ROLE_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{"email": "admin@example.com", "password": "SuaSenhaSegura", "email_confirm": true}'
```

### 6. Executar

#### Desenvolvimento local (monolítico)

```bash
# Runner completo (scraper loop + sender loop + API na porta 8000)
uv run python -m crivo.runner

# Ou apenas o pipeline de scraping (executa uma vez)
uv run python -m crivo.scraper.pipeline

# Health check de todos os servicos
uv run python -m crivo.monitoring.health_check

# Painel Admin
cd admin
npm run dev
# Acesse http://localhost:3000
```

#### Produção (Docker Compose)

```bash
# Sobe todos os containers: redis, scraper, sender, api, admin
docker compose up -d

# Ver logs de um serviço específico
docker compose logs -f scraper
docker compose logs -f sender
docker compose logs -f api
```

Os workers se comunicam via Redis (`USE_REDIS_STATE=true` no compose). O container `api` lê o estado dos outros workers pelo Redis.

### 7. Acessar os recursos

| Recurso | URL | Descricao |
|---|---|---|
| Painel Admin | http://localhost:3000 | Dashboard, ofertas, fila de envio, monitor |
| API Backend | http://localhost:8000 | FastAPI (docs em `/docs`) |
| API Admin | http://localhost:8000/api/admin/* | Endpoints do painel admin |
| Health Check | http://localhost:8000/api/health | Status dos servicos |

---

## Painel Admin

O painel admin permite controle visual completo sobre o pipeline de ofertas.

### Paginas

- **Dashboard** — KPIs (produtos scrapeados, ofertas aprovadas, enviadas, score medio), top deals, status do sistema, acoes rapidas (forcar scraping, enviar proxima oferta)
- **Ofertas** — DataTable com tabs (Todas/Aprovadas/Pendentes/Rejeitadas), busca por titulo, acoes inline (aprovar/rejeitar/deletar), acoes em lote, painel lateral com detalhes completos
- **Fila de Envio** — Lista com drag-and-drop para reordenar prioridade, acoes por item (enviar agora, fixar no topo, pular), stats da fila (total, maior score, desconto medio)
- **Monitor** — Status dos workers (scraper, sender, api), proximos eventos agendados, logs recentes
- **Analytics** — Metricas e graficos (serie temporal, funil, distribuicao por categoria)
- **Config** — Configuracoes do sistema editaveis pelo admin

### Design

- Tema cyberpunk deep purple com dark/light mode toggle
- Sidebar colapsável no desktop, hamburger menu no mobile
- Glass morphism nos cards (backdrop-blur)
- Responsivo para mobile e desktop

### Endpoints Admin (FastAPI)

```
# Autenticacao via JWT do Supabase Auth (header Authorization: Bearer <token>)

# Ofertas
PATCH  /api/admin/offers/{id}/status     # Aprovar/rejeitar/pendente
PATCH  /api/admin/offers/{id}/notes      # Adicionar notas
DELETE /api/admin/offers/{id}            # Deletar oferta
POST   /api/admin/offers/bulk            # Acao em lote (approve/reject/delete)

# Fila
POST   /api/admin/queue/reorder          # Reordenar (drag-and-drop)
POST   /api/admin/queue/{id}/skip        # Mover para o fim
POST   /api/admin/queue/{id}/pin         # Fixar no topo

# Acoes
POST   /api/admin/send-now              # Enviar proxima oferta
POST   /api/admin/send-now/{id}         # Enviar oferta especifica
POST   /api/admin/scrape-now            # Disparar scraping

# Configuracoes
GET    /api/admin/settings              # Ler configs
PATCH  /api/admin/settings              # Atualizar configs

# Analytics
GET    /api/admin/analytics/daily       # Metricas diarias
GET    /api/admin/analytics/hourly      # Envios por hora
GET    /api/admin/analytics/funnel      # Funil de conversao
```

---

## Schema de Banco

6 tabelas no Supabase (5 espelhadas no SQLite local), 21 migrations aplicadas:

| Tabela | Descricao |
|---|---|
| `products` | Produto unico por `ml_id` (UUID PK, trigger preserva `first_seen_at`, colunas: `pix_price`, `installments`, `brand`, `gender`) |
| `price_history` | Historico de precos por produto |
| `scored_offers` | Pontuacao de cada oferta + `queue_priority`, `score_override`, `admin_notes` |
| `sent_offers` | Controle de dedup + `triggered_by` (auto/admin) |
| `system_logs` | Logs estruturados de eventos do sistema |
| `admin_settings` | Configuracoes do painel admin (chave-valor JSONB) |

**Views:**
- `vw_approved_unsent` — Fila de envio ordenada por prioridade e score
- `vw_top_deals` — Top ofertas recentes
- `vw_last_24h_summary` — KPIs das ultimas 24h

**RPCs:**
- `fn_score_distribution(hours_back)` — Histograma de scores
- `fn_hourly_sends(target_date)` — Envios por hora
- `fn_daily_metrics(days_back)` — Metricas diarias
- `fn_conversion_funnel(days_back)` — Funil de conversao

**Estrategia de escrita:** dual-write (SQLite sempre + Supabase se disponivel). SQLite sincroniza automaticamente com Supabase ao reconectar via coluna `synced`.

---

## Score Engine

Filtros hard (aplicados antes da pontuacao):
- Desconto `< 20%` → rejeitado imediatamente
- Score final `< 60` → rejeitado (configuravel via `SCORE_MIN_SCORE`)

| Criterio | Pts max | Formula |
|---|---|---|
| Desconto % | 30 | Sigmoide centrada em 35% |
| Badge | 15 | Hierarquia: Oferta Relampago > Oferta do Dia > Mais Vendido > Oferta Imperdivel |
| Avaliacao (estrelas) | 15 | Linear 4.0-5.0 |
| N. de reviews | 10 | Logaritmica |
| Frete gratis | 10 | Binario |
| Parcelamento sem juros | 10 | Binario |
| Qualidade do titulo | 10 | Heuristicas (comprimento, clareza, sem spam) |

Criterios sem dados tem peso redistribuido dinamicamente para manter a escala 0-100 consistente.

---

## Title Generator — Style Guide v3

O `title_generator.py` gera títulos catchy via Claude Haiku 4.5 (OpenRouter) com 7 fórmulas em rotação:

- Urgência e escassez
- Benefício direto
- Comparação de preço
- Chamada para ação
- Social proof
- Exclusividade
- Humor/Criatividade

O `message_validator.py` valida conformidade com o Style Guide antes do envio (soft check — loga warnings mas não bloqueia).

---

## Sender — Distribuicao Temporal

O sender envia ofertas da fila com distribuicao inteligente por janela de horario (8h-23h BRT):

| Janela | Volume |
|---|---|
| 08h-10h | 28% (pico matinal) |
| 10h-13h | 14% |
| 13h-16h | 30% (pico da tarde) |
| 16h-18h | 13% |
| 18h-23h | 15% |

Multiplicadores por dia: Sexta +20%, Terca -15%. Intervalos entre envios ajustados dinamicamente com jitter aleatorio.

---

## Anti-Bloqueio

O `BaseScraper` usa multiplas camadas de protecao:

- **Rotacao de User-Agent** — `fake-useragent` com lista estatica de fallback
- **Delays aleatorios** — 2-5s entre requisicoes (configuravel)
- **Viewports aleatorios** — 4 resolucoes simuladas
- **Headers realistas** — `Accept-Language pt-BR`, `DNT`, `Sec-Fetch-*`
- **Scroll humano** — steps aleatorios com micro-delays
- **Rotacao de contexto** — novo contexto Playwright a cada 20 requisicoes
- **Playwright Stealth** — remove `navigator.webdriver`
- **Aceitacao automatica de cookies** — clica no banner automaticamente
- **Retry com backoff exponencial** — Tenacity (ate 3 tentativas)
- **Bloqueio de recursos** — imagens, fontes e midia bloqueadas (~3x mais rapido)

---

## Debug de Rejeitados

Com `SCRAPER_DEBUG_SCREENSHOTS=true` no `.env`, o sistema gera um relatorio HTML em `debug/rejected/{run_id}/index.html` com:

- Screenshot de cada card rejeitado
- Pontuacao final e motivo da rejeicao
- Breakdown detalhado por criterio
- JSON completo do produto (collapsible)

---

## Variaveis de Ambiente Principais

| Variavel | Padrao | Descricao |
|---|---|---|
| `APP_ENV` | `development` | `production` ativa Supabase exclusivo |
| `TEST_MODE` | `false` | Relaxa filtros para gerar mais ofertas em teste |
| `USE_REDIS_STATE` | `false` | Compartilha estado entre containers via Redis |
| `REDIS_URL` | `redis://localhost:6379/0` | URL do Redis |
| `SCORE_MIN_DISCOUNT_PCT` | `20` | Desconto minimo para entrar no score (%) |
| `SCORE_MIN_SCORE` | `60` | Pontuacao minima para publicar (0-100) |
| `SCRAPER_MAX_PAGES` | `10` | Maximo de paginas por fonte |
| `SCRAPER_HEADLESS` | `true` | Browser headless ou visivel |
| `SCRAPER_INTERVAL` | `3600` | Intervalo entre ciclos de scraping (segundos) |
| `SCRAPER_DEBUG_SCREENSHOTS` | `false` | Gera relatorio HTML dos rejeitados |
| `SENDER_START_HOUR` | `8` | Hora de inicio do envio (BRT) |
| `SENDER_END_HOUR` | `23` | Hora de fim do envio (BRT) |
| `SENDER_MIN_INTERVAL` | `3` | Intervalo minimo entre envios (minutos) |
| `SENDER_MAX_INTERVAL` | `6` | Intervalo maximo entre envios (minutos) |
| `TITLE_REVIEW_ENABLED` | `false` | Ativa revisao de titulos pelo admin via Telegram |
| `LIFESTYLE_IMAGE_MODEL` | `nano-banana-2` | Modelo de geracao de imagens lifestyle (OpenRouter) |

Ver `.env.example` para a lista completa com documentacao.

---

## Roadmap

### ✅ Fase 1 — Base (concluida)

- [x] Config singleton tipado com dataclasses
- [x] Logging estruturado com structlog + rich + cores + truncamento
- [x] BaseScraper com anti-bloqueio completo
- [x] ML Scraper — Ofertas do Dia com paginacao e seletores unificados
- [x] Classificador de categoria (keywords + fallback OpenRouter/Gemini)
- [x] Score Engine — 7 criterios com redistribuicao dinamica de pesos
- [x] Detector de desconto falso — 5 heuristicas de pricejacking
- [x] Banco dual-write Supabase + SQLite com sync automatico e failover
- [x] Schema v2 — 5 tabelas com trigger de `first_seen_at`
- [x] Alert bot para admin via Telegram
- [x] Health check de todos os servicos
- [x] Message formatter (templates Telegram + WhatsApp)
- [x] Affiliate link builder com cache em DB
- [x] Pipeline de scraping extraido em `pipeline.py`
- [x] Debug HTML com screenshots dos cards rejeitados

### ✅ Fase 2 — Distribuicao & Admin (concluida)

- [x] Workers isolados por container (scraper, sender, api)
- [x] Estado compartilhado entre containers via Redis (`redis_state.py`)
- [x] Docker Compose com 5 servicos (redis, scraper, sender, api, admin)
- [x] Publicacao ativa no Telegram com titulos gerados por IA (Style Guide v3)
- [x] Title Generator — 7 formulas via Claude Haiku 4.5
- [x] Message Validator — checklist de conformidade pre-envio
- [x] Revisao interativa de titulos pelo admin via Telegram Bot
- [x] Geracao de imagens lifestyle via OpenRouter (2 passos: analise + geracao)
- [x] Image Storage — upload/recuperacao via Supabase Storage
- [x] Painel Admin — Dashboard com KPIs e status do sistema
- [x] Painel Admin — CRUD de ofertas com DataTable, filtros e acoes em lote
- [x] Painel Admin — Fila de envio com drag-and-drop e acoes (enviar agora, fixar, pular)
- [x] Painel Admin — Pagina Monitor (status dos workers, proximos eventos)
- [x] API Admin (FastAPI) com autenticacao JWT via Supabase Auth
- [x] Tema cyberpunk deep purple com dark/light mode

### 🔄 Fase 3 — Analytics & Finalizacao (em andamento)

- [ ] Analytics com graficos (Recharts) — serie temporal, funil, distribuicao por categoria
- [ ] Pagina de configuracoes editaveis no painel admin
- [ ] Publicacao ativa no WhatsApp via Evolution API
- [ ] Deploy completo em VPS Hostinger

### 📋 Fase 4 — Enriquecimento & Escala

- [ ] Worker de enriquecimento profundo — visita URLs para coletar seller_reputation, reviews
- [ ] Expansao de nichos alem de Moda (Eletronicos, Casa, etc.)
- [ ] Relatorio diario automatico (ofertas publicadas, aprovacao %, score medio)

---

*Sempre Black — Todo dia e Black Friday* 🖤
