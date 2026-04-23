# Business Rules — crivo

## Domain Overview

Sistema de curadoria automática de ofertas do Mercado Livre: scrapa, pontua, filtra e distribui as melhores ofertas via Telegram e WhatsApp para grupos de compradores.

## Entities & Invariants

### Offer (oferta)

- **Invariante:** score nunca pode ser publicado sem passar pelo score engine
- **Invariante:** URL de afiliado deve sempre conter o tag `ML_AFFILIATE_TAG`
- **Invariante:** oferta só é publicada se `score >= SCORE_MIN_SCORE`
- **Estado válido:** `scraped → scored → [rejected | approved] → [queued | published]`

### Product (produto)

- **Invariante:** produto com `is_active = false` não entra na fila de publicação
- **Invariante:** `price_history` nunca pode ser deletado — apenas adicionado

### Title (título gerado por IA)

- **Invariante:** título precisa de aprovação admin (`TITLE_REVIEW_ENABLED=true`) antes de publicar
- **Invariante:** máximo `TITLE_REVIEW_MAX_REGEN=3` regenerações por rejeição

## Core Rules

### Score Engine

**Contexto:** toda oferta scrapeada antes de ser publicada.
**Regra:** score calculado com pesos configuráveis via env vars. Quando um critério não tem dados (ex: rating=0), seu peso é redistribuído proporcionalmente.
**Exceção:** `TEST_MODE=true` relaxa todos os filtros.
**Implementação:** `src/analyzer/score_engine.py`

Critérios (pesos padrão):
| Critério | Peso | Tipo |
|----------|------|------|
| Desconto | 30% | Sigmoid (centro 35%, cap 80%) |
| Badge | 15% | Discreto (relâmpago > imperdível > dia > mais vendido) |
| Rating | 15% | Linear (piso 3.5, teto 5.0) |
| Reviews | 10% | Logarítmico (satura em 5000) |
| Frete grátis | 10% | Binário |
| Parcelamento sem juros | 10% | Binário |
| Qualidade do título | 10% | Heurísticas |

### Sender Window

**Contexto:** envio de ofertas para grupos.
**Regra:** só envia entre `SENDER_START_HOUR` e `SENDER_END_HOUR` (BRT). Intervalo aleatório entre `SENDER_MIN_INTERVAL` e `SENDER_MAX_INTERVAL` minutos.
**Exceção:** alertas críticos do AlertBot ignoram a janela de envio.

### Affiliate Link

**Contexto:** toda URL publicada no bot.
**Regra:** URL deve passar pelo serviço de afiliados ML e conter `ML_AFFILIATE_TAG`.
**Implementação:** `src/scraper/` (link gerado durante scraping)

### Scraping Anti-Block

**Contexto:** todo request ao Mercado Livre.
**Regra:** delay aleatório entre requisições. Cookies de sessão obrigatórios. User-agent rotativo.
**Exceção:** modo debug pode desabilitar delays.

## State Machines

### Offer Status

```
[scraped] → [scored] → [rejected]  (score < mínimo ou filtros)
                     → [approved]  → [queued] → [published]
                                              → [skipped]  (fora da janela)
```

## Authorization Rules (painel admin)

| Ação | Roles | Condição extra |
|------|-------|----------------|
| Ver ofertas | admin | — |
| Aprovar/rejeitar título | admin | TITLE_REVIEW_ENABLED=true |
| Configurar fontes de scraping | admin | — |
| Ver logs e métricas | admin | — |

## Validation Rules

| Campo | Regra |
|-------|-------|
| `discount_pct` | >= SCORE_MIN_DISCOUNT_PCT para entrar no score |
| `rating` | >= SCORE_MIN_RATING (se presente) |
| `reviews_count` | >= SCORE_MIN_REVIEWS (se presente) |
| `affiliate_url` | deve conter ML_AFFILIATE_TAG |

## Known Edge Cases

- **ML cookies expirados:** scraper retorna 401/redirect — AlertBot notifica, scraper pausa
- **Supabase indisponível:** StorageManager usa SQLite como fallback automaticamente
- **Rating ausente:** peso redistribuído proporcionalmente entre outros critérios
- **Offer relâmpago expirada:** URL ainda válida mas desconto pode ter mudado — não re-scrapa
- **Double processing:** scraper pode rodar em paralelo — StorageManager usa upsert

## Glossário

| Termo | Definição |
|-------|-----------|
| Score | Pontuação 0-100 calculada pelo score engine |
| Badge | Indicador de promoção ML (relâmpago, do dia, imperdível, mais vendido) |
| Frete | Frete grátis = bônus no score |
| Tag de afiliado | `ML_AFFILIATE_TAG` incluso na URL para rastreio de comissão |
| AlertBot | Bot interno que notifica admin sobre erros críticos (cookies, falhas) |
| Sender | Componente que envia ofertas aprovadas para grupos Telegram/WhatsApp |
