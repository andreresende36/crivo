# API Reference — crivo

## FastAPI (src/api/)

### Base URL

```
Development:  http://localhost:8000
Production:   [configurar conforme VPS]
```

### Authentication

```
Type:   Bearer token (Supabase JWT) ou service role key
Header: Authorization: Bearer <token>
```

### Endpoints Internos

> **Nota:** Preencher conforme endpoints em `src/api/` forem sendo documentados.

#### `GET /health`
Health check do sistema.

**Response 200**
```json
{ "status": "ok", "supabase": "ok", "sqlite": "ok" }
```

---

#### `POST /offers/list`
Lista ofertas filtradas do banco.

| Param | Tipo | Descrição |
|-------|------|-----------|
| `limit` | int | Máx de ofertas (default: 20) |
| `min_score` | float | Score mínimo |

---

## External APIs Consumidas

| Serviço | Finalidade | Client |
|---------|-----------|--------|
| Supabase REST (PostgREST) | Banco principal | `supabase==2.10.0` |
| Mercado Livre (scraping) | Fonte de ofertas | Playwright + httpx |
| Telegram Bot API | Distribuição de ofertas | `python-telegram-bot==21.9` |
| Evolution API (WhatsApp) | Distribuição de ofertas | httpx (REST direto) |
| OpenRouter API | LLM + geração de imagens | httpx (REST) |
| Anthropic API | Claude SDK (análise) | `anthropic==0.42.0` |

## Error Format (FastAPI)

```json
{
  "error": "mensagem legível",
  "code": "SNAKE_CASE_CODE",
  "details": {}
}
```

| HTTP | Situação |
|------|----------|
| 400 | Input inválido |
| 401 | Token ausente ou inválido |
| 403 | Sem permissão |
| 404 | Recurso inexistente |
| 500 | Erro interno |

## Notas

- Supabase usa PostgREST — filtros via query params (`.eq()`, `.gte()`, etc.)
- Evolution API requer header `apikey` em todas as chamadas
- OpenRouter requer `Authorization: Bearer sk-or-...` + header `HTTP-Referer`
