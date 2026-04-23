# DOMAIN: Filas e Background Jobs — crivo

> Aplica-se a: `src/workers/`, `src/scraper/`, `src/distributor/`, qualquer lógica de retry/backoff

## Contexto do Projeto

O crivo é essencialmente um pipeline de data: scraper → analyzer → storage → distributor.
Cada etapa pode falhar independentemente. O sistema usa workers assíncronos (Python asyncio)
em vez de filas formais (BullMQ/Celery), mas os mesmos princípios se aplicam.

## Core Concepts

- **Worker**: processo asyncio que executa o pipeline de scraping em loop com `SCRAPER_INTERVAL`
- **Idempotência**: re-processar a mesma oferta produz o mesmo resultado (upsert no banco)
- **Retry com backoff**: `tenacity` com backoff exponencial em todas as chamadas de rede
- **Graceful shutdown**: workers tratam SIGTERM antes de parar
- **StorageManager**: ponto único de escrita — fallback automático Supabase → SQLite

## Architecture Rules

### Retry Strategy (tenacity)

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True
)
async def call_external_api():
    ...
```

### Idempotência

- Toda escrita no banco usa **upsert** — nunca `INSERT` puro em ofertas/produtos
- Re-executar scraping da mesma URL deve produzir o mesmo estado no banco
- Geração de imagem: verificar se já existe antes de chamar OpenRouter

### Graceful Shutdown

```python
import signal
import asyncio

async def main():
    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def handle_sigterm():
        stop_event.set()

    loop.add_signal_handler(signal.SIGTERM, handle_sigterm)

    try:
        await run_pipeline(stop_event)
    finally:
        await cleanup()  # fechar playwright, supabase, etc.
```

### Rate Limiting (anti-bloqueio ML)

- Delay aleatório entre requests: `SCRAPER_DELAY_MIN` a `SCRAPER_DELAY_MAX` segundos
- User-agent rotativo via `fake-useragent`
- Cookies de sessão ML obrigatórios — AlertBot avisa quando expiram

### Sender Queue (distribuição)

- Só envia dentro da janela `SENDER_START_HOUR`–`SENDER_END_HOUR` (BRT)
- Delay aleatório entre envios: `SENDER_MIN_INTERVAL`–`SENDER_MAX_INTERVAL` minutos
- Telegram: delay entre mensagens `TELEGRAM_SEND_DELAY` (flood protection)
- WhatsApp: delay `WHATSAPP_SEND_DELAY` + limite `WHATSAPP_MAX_MSG_PER_MIN`

## Routing Table

| Trigger | Action |
|---------|--------|
| SCRAPER_INTERVAL expirou | Iniciar ciclo de scraping — buscar fontes habilitadas |
| Oferta scrapeada | Passar pelo score engine → StorageManager.upsert() |
| Oferta aprovada | Enfileirar para sender |
| Sender: oferta na fila | Verificar janela de horário → formatar → enviar |
| Chamada de rede falhou | tenacity retry com backoff exponencial |
| ML cookies expirados | Parar scraping + AlertBot.notify(admin) |
| SIGTERM recebido | Graceful shutdown: aguardar operação atual + cleanup |
| Supabase timeout | StorageManager → fallback para SQLite automaticamente |
| Imagem existente | Skip geração — retornar URL existente |

## Critical Rules

1. **Idempotência obrigatória** — processar mesma oferta 2x não pode duplicar dados
2. **Graceful shutdown** — SIGTERM não pode matar worker no meio de um write
3. **Alertas em falhas críticas** — ML cookie expirado, Supabase down → AlertBot
4. **Upsert sempre** — nunca INSERT puro em tabelas de ofertas/produtos
5. **Enfileirar após commit** — nunca enfileirar para distribuição antes de confirmar o save
6. **Rate limiting** — delays obrigatórios em todo request ao ML e bots
7. **Retry com backoff** — toda chamada de rede externa usa tenacity
8. **Payload mínimo** — passar IDs de referência, não objetos completos

## Common Pitfalls (específicos do crivo)

### ❌ Cookies ML expirados sem alerta
```python
# ERRADO: falha silenciosa
async def scrape():
    response = await client.get(url)  # 401 sem notificação

# CORRETO: detectar e alertar
async def scrape():
    response = await client.get(url)
    if response.status_code == 401:
        await alert_bot.notify("ML cookies expirados")
        raise CookiesExpiredError()
```

### ❌ INSERT sem upsert
```python
# ERRADO: duplica ofertas em re-scraping
await supabase.table("offers").insert(offer_data).execute()

# CORRETO: upsert por URL ou ID
await supabase.table("offers").upsert(offer_data, on_conflict="url").execute()
```

### ❌ Playwright sem cleanup
```python
# ERRADO: browser fica aberto se worker crasha
browser = await playwright.chromium.launch()
# ... se exception aqui, browser vaza

# CORRETO: always use context manager
async with async_playwright() as p:
    browser = await p.chromium.launch()
    try:
        ...
    finally:
        await browser.close()
```

## Quality Gates

- [ ] Todos os writes no banco usam upsert (verificar com grep `\.insert(`)
- [ ] Graceful shutdown implementado em todos os workers (`SIGTERM` handler)
- [ ] AlertBot notifica em falhas críticas (cookies, Supabase down)
- [ ] tenacity em todas as chamadas de rede externas
- [ ] Rate limiting respeitado (delays configurados via env vars)
- [ ] Playwright sempre fechado no finally/context manager
