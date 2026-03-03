# DealHunter 🖤

> **"Todo dia é Black Friday"** — Sistema automatizado de caça de ofertas para os grupos *Sempre Black* no WhatsApp e Telegram.

## O que é

O DealHunter monitora continuamente o Mercado Livre, filtra ofertas genuínas com IA e publica automaticamente nos grupos com links de afiliado encurtados.

**Fluxo principal:**
```
Mercado Livre → Scraper → Score Engine → (IA) → Afiliado → Shlink → Telegram + WhatsApp
```

## Stack

| Componente | Tecnologia |
|---|---|
| Scraping | Playwright + BeautifulSoup |
| Banco principal | Supabase (PostgreSQL) |
| Banco fallback | SQLite (local) |
| IA | Claude Haiku (Anthropic) |
| Orquestração | n8n |
| Encurtador | Shlink |
| Telegram | python-telegram-bot |
| WhatsApp | Evolution API |
| Servidor | VPS Hostinger + Docker |

## Estrutura do Projeto

```
dealhunter/
├── src/
│   ├── scraper/            # Coleta de ofertas (Playwright)
│   │   ├── base_scraper.py # Anti-bloqueio: UA rotation, delays, contexto
│   │   ├── ofertas_do_dia.py
│   │   └── categoria_moda.py
│   ├── analyzer/           # Avaliação de qualidade
│   │   ├── score_engine.py           # Regras (0-100 pts)
│   │   ├── fake_discount_detector.py # Detecta pricejacking
│   │   └── ai_analyzer.py            # Claude Haiku (Fase 2)
│   ├── distributor/        # Publicação nos grupos
│   │   ├── message_formatter.py
│   │   ├── affiliate_links.py
│   │   ├── shlink_client.py
│   │   ├── telegram_bot.py
│   │   └── whatsapp_notifier.py
│   ├── database/           # Persistência
│   │   ├── supabase_client.py
│   │   ├── sqlite_fallback.py
│   │   ├── storage_manager.py  # Failover automático
│   │   └── schema.sql
│   ├── monitoring/         # Saúde e relatórios
│   │   ├── health_check.py
│   │   ├── alert_bot.py
│   │   └── daily_report.py
│   └── config.py           # Configuração central (lê .env)
├── tests/
├── n8n/workflows/          # Workflows de orquestração
├── supabase/migrations/    # Migrations do banco
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## Setup — Início Rápido

### 1. Pré-requisitos

- Python 3.11+
- Docker + Docker Compose
- Conta no [Supabase](https://supabase.com) (gratuita)
- Bot no Telegram (via [@BotFather](https://t.me/BotFather))
- Chave de API da [Anthropic](https://console.anthropic.com)

### 2. Clonar e configurar ambiente

```bash
# Clonar
git clone <repo-url>
cd dealhunter

# Criar ambiente virtual
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows

# Instalar dependências
pip install -r requirements.txt

# Instalar browsers do Playwright
playwright install chromium
```

### 3. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Editar .env com suas credenciais
nano .env
```

Variáveis obrigatórias para começar:
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_GROUP_IDS`
- `ANTHROPIC_API_KEY`

### 4. Inicializar banco de dados

No Supabase Dashboard → SQL Editor, executar o conteúdo de `src/database/schema.sql`.

### 5. Subir os serviços Docker

```bash
# Subir n8n + Shlink
docker compose up -d n8n shlink

# Verificar saúde
docker compose ps
```

- **n8n**: http://localhost:5678
- **Shlink**: http://localhost:8080

### 6. Rodar os testes

```bash
pytest tests/ -v
```

### 7. Executar o scraper manualmente

```bash
# Scraper de ofertas do dia
python -m src.scraper.ofertas_do_dia

# Health check completo
python -m src.monitoring.health_check
```

## Docker — Produção

```bash
# Build e subir todos os serviços
docker compose up -d --build

# Logs da aplicação
docker compose logs -f app

# Restart após mudanças
docker compose restart app
```

## Configuração do Score Engine

Os filtros de qualidade são configurados no `.env`:

| Variável | Padrão | Descrição |
|---|---|---|
| `SCORE_MIN_DISCOUNT_PCT` | 20 | Desconto mínimo (%) |
| `SCORE_MIN_SCORE` | 60 | Pontuação mínima (0-100) |
| `SCORE_MIN_RATING` | 4.0 | Avaliação mínima (estrelas) |
| `SCORE_MIN_REVIEWS` | 10 | Mínimo de avaliações |

**Critérios e pesos:**
- Desconto: até 35 pts
- Avaliação: até 20 pts
- Nº de reviews: até 15 pts
- Frete grátis: 10 pts
- Loja oficial: 10 pts
- Qualidade do título: até 10 pts

## Roadmap

- [x] **Semana 1** — Setup do ambiente e estrutura do projeto
- [ ] **Semana 2** — Scraper MVP funcional (Ofertas do Dia)
- [ ] **Semana 3** — Score Engine + Publicação no Telegram
- [ ] **Semana 4** — WhatsApp + Shlink + Afiliados
- [ ] **Semana 5** — IA com Claude Haiku + Histórico de preços
- [ ] **Semana 6** — Monitoramento + Relatórios + Deploy em produção

## Anti-Bloqueio — Técnicas Implementadas

O `BaseScraper` usa múltiplas técnicas para evitar detecção:

- **Rotação de User-Agent**: 20+ UAs reais (Chrome, Firefox, Safari, mobile)
- **Delays aleatórios**: 2-5 segundos entre requisições
- **Headers realistas**: Accept-Language pt-BR, DNT, Sec-Fetch-*
- **Scroll humano**: simula navegação natural na página
- **Rotação de contexto**: novo contexto de browser a cada 20 requisições
- **Injeção de JS**: remove sinais de automação (`navigator.webdriver`)
- **Bloqueio de recursos**: imagens, fontes e mídia são bloqueadas (mais rápido)
- **Retry com backoff**: tenacity com espera exponencial em falhas

## Contribuindo

1. Crie uma branch: `git checkout -b feature/nome-da-feature`
2. Implemente e adicione testes
3. Rode `pytest` e `ruff check src/`
4. Abra um PR com descrição clara

---

*Sempre Black — Todo dia é Black Friday* 🖤
