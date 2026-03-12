# DealHunter 🖤

> **"Todo dia é Black Friday"** — Sistema automatizado de caça de ofertas para os grupos *Sempre Black* no WhatsApp e Telegram.

## O que é

O DealHunter monitora continuamente o Mercado Livre, filtra ofertas genuínas com regras e IA, e publica automaticamente nos grupos com links de afiliado encurtados.

**Pipeline principal:**
```
Mercado Livre → Scraper → Dedup → Fake Filter → Score Engine → DB → Afiliado → Shlink → Telegram + WhatsApp
```

---

## Stack

| Componente | Tecnologia |
|---|---|
| Scraping | Playwright + BeautifulSoup + lxml |
| Classificação de categoria | OpenRouter (Gemini 2.5 Flash) |
| IA de análise avançada | Claude Haiku — Fase 2 |
| Banco principal | Supabase (PostgreSQL) |
| Banco fallback | SQLite local (dual-write + sync automático) |
| Encurtador | Shlink (self-hosted) |
| Telegram | python-telegram-bot v21 |
| WhatsApp | Evolution API |
| Orquestração | n8n |
| Servidor | VPS Hostinger + Docker |

---

## Estrutura do Projeto

```
dealhunter/
├── src/
│   ├── main.py                        # Pipeline principal (scrape → score → save)
│   ├── config.py                      # Settings singleton (11 seções tipadas, lê .env)
│   ├── logging_config.py              # Logging estruturado com rich + cores + truncamento
│   │
│   ├── scraper/
│   │   ├── base_scraper.py            # Anti-bloqueio completo (UA rotation, delays, CAPTCHA, cookies)
│   │   ├── ml_scraper.py              # Scraper unificado ML — Ofertas do Dia, paginação, debug
│   │   └── ml_classifier.py          # Classificador de categorias (keywords + fallback OpenRouter)
│   │
│   ├── analyzer/
│   │   ├── score_engine.py            # Score 0-100 pts (7 critérios, pesos dinâmicos)
│   │   ├── fake_discount_detector.py  # Detector de pricejacking (5 heurísticas)
│   │   └── card_debugger.py           # Relatório HTML com screenshots dos rejeitados
│   │
│   ├── distributor/
│   │   ├── message_formatter.py       # Templates de mensagem para Telegram e WhatsApp
│   │   ├── affiliate_links.py         # Builder de links ML com cache em DB
│   │   ├── ml_affiliate_api.py        # Wrapper da API de afiliados do ML
│   │   ├── shlink_client.py           # Cliente Shlink para encurtamento de URLs
│   │   ├── telegram_bot.py            # Publicação nos grupos do Telegram
│   │   └── whatsapp_notifier.py       # Publicação nos grupos do WhatsApp
│   │
│   ├── database/
│   │   ├── storage_manager.py         # Failover automático Supabase → SQLite
│   │   ├── supabase_client.py         # Cliente async PostgreSQL via Supabase
│   │   ├── sqlite_fallback.py         # Mirror local + coluna `synced` para sync offline
│   │   ├── schema.sql                 # Schema v2 (5 tabelas)
│   │   ├── seeds.py                   # Dados canônicos: badges, categorias, marketplaces
│   │   └── exceptions.py             # SQLiteError, SupabaseError
│   │
│   ├── monitoring/
│   │   ├── alert_bot.py               # Alertas para chat admin via Telegram Bot API
│   │   └── health_check.py            # Health check de todos os serviços externos
│   │
│   └── utils/
│       └── password.py                # Hash de senhas (bcrypt)
│
├── tests/
├── debug/rejected/                    # Relatórios HTML gerados (gitignored)
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## Schema de Banco (v2)

5 tabelas no Supabase (espelhadas no SQLite local):

| Tabela | Descrição |
|---|---|
| `products` | Produto único por `ml_id` (UUID PK, trigger preserva `first_seen_at`) |
| `price_history` | Histórico de preços por produto |
| `scored_offers` | Pontuação de cada oferta por execução |
| `sent_offers` | Controle de dedup — ofertas já publicadas |
| `system_logs` | Logs estruturados de eventos do sistema |

**Estratégia de escrita:** dual-write (SQLite sempre + Supabase se disponível). SQLite sincroniza automaticamente com Supabase ao reconectar via coluna `synced`.

---

## Score Engine

Filtros hard (aplicados antes da pontuação):
- Desconto `< 20 %` → rejeitado imediatamente
- Score final `< 60` → rejeitado (configurável via `SCORE_MIN_SCORE`)

| Critério | Pts máx | Fórmula |
|---|---|---|
| Desconto % | 30 | Sigmóide centrada em 35 % |
| Badge | 15 | Hierarquia: Oferta Relâmpago > Oferta do Dia > Mais Vendido > Oferta Imperdível |
| Avaliação (estrelas) | 15 | Linear 4.0–5.0 |
| Nº de reviews | 10 | Logarítmica |
| Frete grátis | 10 | Binário |
| Parcelamento sem juros | 10 | Binário |
| Qualidade do título | 10 | Heurísticas (comprimento, clareza, sem spam) |

Critérios sem dados têm peso redistribuído dinamicamente para manter a escala 0-100 consistente.

---

## Anti-Bloqueio

O `BaseScraper` usa múltiplas camadas de proteção:

- **Rotação de User-Agent** — `fake-useragent` (Chrome, Firefox, Safari, Edge, mobile) com lista estática de fallback
- **Delays aleatórios** — 2–5 s entre requisições (configurável)
- **Viewports aleatórios** — 4 resoluções simuladas (1920×1080 até 1280×800)
- **Headers realistas** — `Accept-Language pt-BR`, `DNT`, `Sec-Fetch-*`, `Cache-Control`
- **Scroll humano** — steps aleatórios de 600–1200 px com micro-delays
- **Rotação de contexto** — novo contexto Playwright a cada 20 requisições (limpa cookies)
- **Playwright Stealth** — remove `navigator.webdriver` e outros sinais de automação
- **Aceitação automática de cookies** — clica no banner via seletores CSS e texto
- **Retry com backoff exponencial** — Tenacity (até 3 tentativas, espera 4–30 s)
- **Bloqueio de recursos** — imagens, fontes e mídia bloqueadas (scraping ~3× mais rápido)

---

## Debug de Rejeitados

Com `SCRAPER_DEBUG_SCREENSHOTS=true` no `.env`, o sistema gera um relatório HTML em `debug/rejected/{run_id}/index.html` com:

- Screenshot de cada card rejeitado (recortado para mostrar apenas badge + info)
- Pontuação final e motivo da rejeição
- Breakdown detalhado por critério
- JSON completo do produto (collapsible)

---

## Setup — Início Rápido

### 1. Pré-requisitos

- Python 3.11+
- Docker + Docker Compose
- Conta no [Supabase](https://supabase.com) (gratuita)
- Bot no Telegram (via [@BotFather](https://t.me/BotFather))
- Chave da [Anthropic](https://console.anthropic.com) (opcional na fase atual)

### 2. Instalar dependências

```bash
git clone <repo-url>
cd dealhunter

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt
playwright install chromium
```

### 3. Configurar ambiente

```bash
cp .env.example .env
# Editar .env com suas credenciais
```

Variáveis obrigatórias:
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_GROUP_IDS`
- `OPENROUTER_API_KEY` (classificação de categoria com IA)

### 4. Inicializar banco de dados

No Supabase Dashboard → SQL Editor, executar `src/database/schema.sql`.

### 5. Executar

```bash
# Roda o pipeline completo
python -m src.main

# Com debug de screenshots dos rejeitados
SCRAPER_DEBUG_SCREENSHOTS=true python -m src.main

# Health check de todos os serviços
python -m src.monitoring.health_check
```

### 6. Subir serviços auxiliares (Docker)

```bash
docker compose up -d n8n shlink
```

- **n8n**: http://localhost:5678
- **Shlink**: http://localhost:8080

---

## Variáveis de Ambiente Principais

| Variável | Padrão | Descrição |
|---|---|---|
| `APP_ENV` | `development` | `production` ativa Supabase exclusivo |
| `SCORE_MIN_DISCOUNT_PCT` | `20` | Desconto mínimo para entrar no score (%) |
| `SCORE_MIN_SCORE` | `60` | Pontuação mínima para publicar (0-100) |
| `SCRAPER_MAX_PAGES` | `5` | Máximo de páginas por fonte |
| `SCRAPER_HEADLESS` | `true` | Browser headless ou visível |
| `SCRAPER_DEBUG_SCREENSHOTS` | `false` | Gera relatório HTML dos rejeitados |

Ver `.env.example` para a lista completa.

---

## Roadmap

### ✅ Fase 1 — Base (concluída)

- [x] Config singleton tipado com dataclasses (11 seções)
- [x] Logging estruturado com rich + cores + truncamento
- [x] BaseScraper com anti-bloqueio completo
- [x] ML Scraper — Ofertas do Dia com paginação e seletores unificados
- [x] Classificador de categoria (keywords + fallback OpenRouter Gemini 2.5 Flash)
- [x] Score Engine — 7 critérios com redistribuição dinâmica de pesos
- [x] Detector de desconto falso — 5 heurísticas de pricejacking
- [x] Banco dual-write Supabase + SQLite com sync automático e failover
- [x] Schema v2 — 5 tabelas com trigger de `first_seen_at`
- [x] Alert bot para admin via Telegram
- [x] Health check de todos os serviços
- [x] Message formatter (templates Telegram + WhatsApp)
- [x] Affiliate link builder com cache em DB
- [x] Shlink client para encurtamento de URLs
- [x] Pipeline principal completo (scrape → dedup → fake filter → score → save)
- [x] Debug HTML com screenshots dos cards rejeitados + breakdown de score

### 🔄 Fase 2 — Distribuição (em andamento)

- [ ] Publicação ativa no Telegram (wiring no pipeline principal)
- [ ] Publicação ativa no WhatsApp via Evolution API
- [ ] Agendamento periódico via n8n (a cada X horas)
- [ ] Relatório diário automático (ofertas publicadas, aprovação %, score médio)

### 📋 Fase 3 — Enriquecimento & Escala

- [ ] Worker de enriquecimento profundo (`src/worker.py`) — visita URLs individuais para coletar `seller_reputation`, `sold_quantity`, reviews detalhados
- [ ] Análise avançada com Claude Haiku (qualidade textual, detecção de spam)
- [ ] Expansão de nichos além de Moda (Eletrônicos, Casa, etc.)
- [ ] Deploy completo em VPS Hostinger + Docker Compose
- [ ] Dashboard de monitoramento

---

*Sempre Black — Todo dia é Black Friday* 🖤
