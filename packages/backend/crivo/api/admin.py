"""
Crivo — Admin API Router
Endpoints para CRUD de ofertas, gerenciamento de fila, envio manual e scraping.

Autenticação: valida JWT do Supabase Auth via header Authorization: Bearer <token>.
"""


from typing import Annotated, Any

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from supabase import AsyncClient, acreate_client

from crivo.api.schemas import OffersListQuery
from crivo.config import settings
from crivo.database.storage_manager import StorageManager

# ---------------------------------------------------------------------------
# Cliente Supabase leve para RPCs de leitura (sem overhead do StorageManager)
# ---------------------------------------------------------------------------
_supabase_rpc_client: AsyncClient | None = None


async def _get_rpc_client() -> AsyncClient:
    """Retorna (ou cria) um cliente Supabase async singleton para RPCs de leitura."""
    global _supabase_rpc_client
    if _supabase_rpc_client is None:
        _supabase_rpc_client = await acreate_client(
            settings.supabase.url,
            settings.supabase.service_role_key or settings.supabase.anon_key,
        )
    return _supabase_rpc_client

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Auth: valida JWT do Supabase Auth
# ---------------------------------------------------------------------------


async def _verify_supabase_jwt(request: Request) -> dict:
    """Valida o JWT do Supabase Auth e retorna o payload do usuário."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token não fornecido")

    token = auth_header.split(" ", 1)[1]
    supabase_url = settings.supabase.url.rstrip("/")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase.anon_key,
            },
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    return resp.json()


# Type alias para dependency injection — resolve S8410
CurrentUser = Annotated[dict, Depends(_verify_supabase_jwt)]

_NOT_FOUND = "Oferta não encontrada"


# ---------------------------------------------------------------------------
# Schemas Pydantic
# ---------------------------------------------------------------------------


class StatusUpdate(BaseModel):
    status: str  # "approved" | "rejected" | "pending"


class NotesUpdate(BaseModel):
    admin_notes: str


class BulkAction(BaseModel):
    ids: list[str]
    action: str  # "approve" | "reject" | "delete"


class QueueReorder(BaseModel):
    offer_id: str
    new_priority: int


class SettingsUpdate(BaseModel):
    settings: dict[str, Any]


class OfferContentUpdate(BaseModel):
    custom_title: str | None = None
    offer_body: str | None = None
    extra_notes: str | None = None


class ApproveToQueueRequest(BaseModel):
    custom_title: str | None = None
    offer_body: str | None = None
    extra_notes: str | None = None


# ---------------------------------------------------------------------------
# Ofertas CRUD
# ---------------------------------------------------------------------------


@router.patch("/offers/{offer_id}/status", responses={400: {"description": "Status inválido"}, 404: {"description": _NOT_FOUND}})
async def update_offer_status(
    offer_id: str,
    body: StatusUpdate,
    _user: CurrentUser,
):
    """Atualiza o status de uma oferta (approved/rejected/pending)."""
    if body.status not in ("approved", "rejected", "pending"):
        raise HTTPException(status_code=400, detail="Status inválido")

    async with StorageManager() as storage:
        if body.status == "rejected":
            ok = await storage.discard_offer(offer_id, reason="admin_rejected")
        else:
            ok = await _update_scored_offer(storage, offer_id, status=body.status)
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True, "status": body.status}


@router.patch("/offers/{offer_id}/notes", responses={404: {"description": _NOT_FOUND}})
async def update_offer_notes(
    offer_id: str,
    body: NotesUpdate,
    _user: CurrentUser,
):
    """Adiciona/edita notas do admin em uma oferta."""
    async with StorageManager() as storage:
        ok = await _update_scored_offer(
            storage, offer_id, admin_notes=body.admin_notes
        )
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.delete("/offers/{offer_id}", responses={404: {"description": _NOT_FOUND}})
async def delete_offer(
    offer_id: str,
    _user: CurrentUser,
):
    """Remove uma oferta da fila (marca como rejected)."""
    async with StorageManager() as storage:
        ok = await storage.discard_offer(offer_id, reason="admin_deleted")
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.post("/offers/bulk", responses={400: {"description": "Ação inválida"}})
async def bulk_action(
    body: BulkAction,
    _user: CurrentUser,
):
    """Ação em lote: aprovar, rejeitar ou deletar múltiplas ofertas."""
    if body.action not in ("approve", "reject", "delete"):
        raise HTTPException(status_code=400, detail="Ação inválida")

    results: list[dict] = []
    async with StorageManager() as storage:
        for offer_id in body.ids:
            try:
                if body.action == "approve":
                    ok = await _update_scored_offer(
                        storage, offer_id, status="approved"
                    )
                elif body.action in ("reject", "delete"):
                    ok = await storage.discard_offer(
                        offer_id, reason=f"admin_{body.action}"
                    )
                else:
                    ok = False
                results.append({"id": offer_id, "ok": ok})
            except Exception as exc:
                results.append({"id": offer_id, "ok": False, "error": str(exc)})

    return {"results": results}


# ---------------------------------------------------------------------------
# Listagem server-side
# ---------------------------------------------------------------------------


@router.get("/offers")
async def list_offers(
    _user: CurrentUser,
    query: Annotated[OffersListQuery, Depends()],
):
    """Listagem paginada de ofertas com filtros server-side (RPC direto, sem StorageManager)."""
    params = {
        "p_status": query.status,
        "p_category_id": query.category_id,
        "p_search": query.search,
        "p_min_price": query.min_price,
        "p_max_price": query.max_price,
        "p_min_discount": query.min_discount,
        "p_min_score": query.min_score,
        "p_date_from": query.date_from.isoformat() if query.date_from else None,
        "p_date_to": query.date_to.isoformat() if query.date_to else None,
        "p_sort_by": query.sort_by,
        "p_sort_dir": query.sort_dir,
        "p_page": query.page,
        "p_page_size": query.page_size,
    }
    try:
        client = await _get_rpc_client()
        resp = await client.rpc("fn_admin_offers_listing", params).execute()
        data = resp.data
    except Exception as exc:
        logger.warning("list_offers_rpc_failed", error=str(exc))
        return {"offers": [], "total": 0, "counts": {}}
    if data is None:
        return {"offers": [], "total": 0, "counts": {}}
    return data


# ---------------------------------------------------------------------------
# Sugestoes IA (titulo + corpo)
# ---------------------------------------------------------------------------


@router.post("/offers/{offer_id}/suggestions")
async def generate_offer_suggestions(
    offer_id: str,
    _user: CurrentUser,
):
    """Gera 3 sugestoes de titulo + 3 sugestoes de corpo via IA."""
    from crivo.distributor.suggestion_generator import generate_suggestions

    client = await _get_rpc_client()
    resp = await (
        client.table("scored_offers")
        .select("product_id, products!inner(title, current_price, original_price, discount_percent, free_shipping, rating_stars, rating_count, categories(name))")
        .eq("id", offer_id)
        .maybe_single()
        .execute()
    )
    if not resp or not resp.data:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    row = resp.data
    product = row["products"]
    category = product.get("categories", {})
    category_name = category.get("name", "") if category else ""

    suggestions = await generate_suggestions(
        product_title=product["title"],
        category=category_name,
        price=float(product["current_price"]),
        original_price=float(product["original_price"]) if product.get("original_price") else None,
        discount_pct=float(product.get("discount_percent", 0)),
        free_shipping=bool(product.get("free_shipping", False)),
        rating=float(product["rating_stars"]) if product.get("rating_stars") else None,
        review_count=int(product["rating_count"]) if product.get("rating_count") else None,
    )
    return suggestions


# ---------------------------------------------------------------------------
# Conteudo curado (titulo, corpo, notas)
# ---------------------------------------------------------------------------


@router.patch("/offers/{offer_id}/content", responses={404: {"description": _NOT_FOUND}})
async def update_offer_content(
    offer_id: str,
    body: OfferContentUpdate,
    _user: CurrentUser,
):
    """Salva titulo, corpo e notas curados pelo admin."""
    fields = {}
    if body.custom_title is not None:
        fields["custom_title"] = body.custom_title
    if body.offer_body is not None:
        fields["offer_body"] = body.offer_body
    if body.extra_notes is not None:
        fields["extra_notes"] = body.extra_notes

    if not fields:
        return {"ok": True}

    async with StorageManager() as storage:
        ok = await _update_scored_offer(storage, offer_id, **fields)
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.post("/offers/{offer_id}/approve-to-queue", responses={404: {"description": _NOT_FOUND}})
async def approve_to_queue(
    offer_id: str,
    body: ApproveToQueueRequest,
    _user: CurrentUser,
):
    """Salva conteudo curado e move a oferta para a fila de envio (status=approved)."""
    fields: dict[str, Any] = {"status": "approved"}
    if body.custom_title is not None:
        fields["custom_title"] = body.custom_title
    if body.offer_body is not None:
        fields["offer_body"] = body.offer_body
    if body.extra_notes is not None:
        fields["extra_notes"] = body.extra_notes

    async with StorageManager() as storage:
        ok = await _update_scored_offer(storage, offer_id, **fields)
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True, "status": "approved"}


@router.post("/offers/{offer_id}/remove-from-queue", responses={404: {"description": _NOT_FOUND}})
async def remove_from_queue(
    offer_id: str,
    _user: CurrentUser,
):
    """Remove oferta da fila de envio, voltando para pendente."""
    async with StorageManager() as storage:
        ok = await _update_scored_offer(
            storage, offer_id, status="pending", queue_priority=0
        )
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True, "status": "pending"}


# ---------------------------------------------------------------------------
# Fila
# ---------------------------------------------------------------------------


@router.get("/queue")
async def get_admin_queue(
    _user: CurrentUser,
):
    """Retorna a fila completa com prioridade e notas do admin."""
    async with StorageManager() as storage:
        if storage._using_supabase:
            offers = await storage._supabase.get_pending_scored_offers(limit=100)
        else:
            offers = await storage._sqlite.get_pending_scored_offers(limit=100)
    return {"queue": offers}


@router.post("/queue/reorder", responses={404: {"description": _NOT_FOUND}})
async def reorder_queue(
    body: QueueReorder,
    _user: CurrentUser,
):
    """Define a prioridade de uma oferta na fila."""
    async with StorageManager() as storage:
        ok = await _update_scored_offer(
            storage, body.offer_id, queue_priority=body.new_priority
        )
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True, "queue_priority": body.new_priority}


@router.post("/queue/{offer_id}/skip", responses={404: {"description": _NOT_FOUND}})
async def skip_offer(
    offer_id: str,
    _user: CurrentUser,
):
    """Move oferta para o final da fila (priority = -1)."""
    async with StorageManager() as storage:
        ok = await _update_scored_offer(storage, offer_id, queue_priority=-1)
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.post("/queue/{offer_id}/pin", responses={404: {"description": _NOT_FOUND}})
async def pin_offer(
    offer_id: str,
    _user: CurrentUser,
):
    """Fixa oferta no topo da fila (priority = 999)."""
    async with StorageManager() as storage:
        ok = await _update_scored_offer(storage, offer_id, queue_priority=999)
        if not ok:
            raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Envio e Scraping manual
# ---------------------------------------------------------------------------


@router.post("/send-now", responses={404: {"description": "Fila vazia"}})
async def send_now(
    _user: CurrentUser,
):
    """Envia a próxima oferta da fila imediatamente."""
    from crivo.distributor.sender import send_next_offer

    async with StorageManager() as storage:
        sent = await send_next_offer(storage)
    if not sent:
        raise HTTPException(status_code=404, detail="Fila vazia")
    return {"ok": True, "message": "Oferta enviada"}


@router.post("/send-now/{offer_id}", responses={500: {"description": "Falha ao enviar"}})
async def send_specific_offer(
    offer_id: str,
    _user: CurrentUser,
):
    """Fixa uma oferta no topo e envia imediatamente."""
    from crivo.distributor.sender import send_next_offer

    async with StorageManager() as storage:
        await _update_scored_offer(storage, offer_id, queue_priority=9999)
        sent = await send_next_offer(storage)
    if not sent:
        raise HTTPException(status_code=500, detail="Falha ao enviar")
    return {"ok": True, "message": "Oferta enviada"}


@router.post("/scrape-now")
async def scrape_now(
    _user: CurrentUser,
):
    """Dispara um ciclo de scraping imediato."""
    from crivo.scraper.pipeline import run_pipeline

    async with StorageManager() as storage:
        stats = await run_pipeline(storage)
    return {"ok": True, "stats": stats}


# ---------------------------------------------------------------------------
# Configurações
# ---------------------------------------------------------------------------


@router.get("/settings")
async def get_settings(
    _user: CurrentUser,
):
    """Retorna configurações editáveis do sistema."""
    async with StorageManager() as storage:
        overrides = await _get_admin_settings(storage)

    return {
        "current": {
            "score_min_discount_pct": settings.score.min_discount_pct,
            "score_min_score": settings.score.min_score,
            "score_min_rating": settings.score.min_rating,
            "score_min_reviews": settings.score.min_reviews,
            "sender_start_hour": settings.sender.start_hour,
            "sender_end_hour": settings.sender.end_hour,
            "sender_min_interval": settings.sender.min_interval,
            "sender_max_interval": settings.sender.max_interval,
        },
        "overrides": overrides,
    }


@router.patch("/settings")
async def update_settings(
    body: SettingsUpdate,
    _user: CurrentUser,
):
    """Atualiza configurações do admin (persistidas em admin_settings)."""
    async with StorageManager() as storage:
        for key, value in body.settings.items():
            await _set_admin_setting(storage, key, value)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------


@router.get("/analytics/daily")
async def analytics_daily(
    _user: CurrentUser,
    days: int = 30,
):
    """Métricas diárias para gráficos trend."""
    async with StorageManager() as storage:
        data = await _call_rpc(storage, "fn_daily_metrics", {"days_back": days})
    return {"data": data}


@router.get("/analytics/hourly")
async def analytics_hourly(
    _user: CurrentUser,
):
    """Envios por hora de hoje."""
    async with StorageManager() as storage:
        data = await _call_rpc(storage, "fn_hourly_sends", {})
    return {"data": data}


@router.get("/analytics/funnel")
async def analytics_funnel(
    _user: CurrentUser,
    hours: int = 24,
):
    """Funil de conversão."""
    async with StorageManager() as storage:
        data = await _call_rpc(storage, "fn_conversion_funnel", {"hours_back": hours})
    return {"data": data}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@router.get("/health")
async def admin_health(
    _user: CurrentUser,
):
    """Health check detalhado com status dos backends."""
    async with StorageManager() as storage:
        ping = await storage.ping()
    return {"backends": ping, "healthy": True}


# ---------------------------------------------------------------------------
# Helpers internos (operações no Supabase via service_role)
# ---------------------------------------------------------------------------


async def _update_scored_offer(
    storage: StorageManager,
    scored_offer_id: str,
    **fields: Any,
) -> bool:
    """Atualiza campos arbitrários de um scored_offer."""
    if storage._using_supabase:
        try:
            resp = await (
                storage._supabase._client.table("scored_offers")
                .update(fields)
                .eq("id", scored_offer_id)
                .execute()
            )
            return bool(resp.data)
        except Exception as exc:
            logger.warning("update_scored_offer_failed", error=str(exc))
            return False
    else:
        # SQLite fallback
        set_clause = ", ".join(f"{k} = ?" for k in fields)
        values = list(fields.values()) + [scored_offer_id]
        try:
            async with storage._sqlite._get_conn() as conn:
                cursor = await conn.execute(
                    f"UPDATE scored_offers SET {set_clause} WHERE id = ?",
                    values,
                )
                await conn.commit()
                return (cursor.rowcount or 0) > 0
        except Exception as exc:
            logger.warning("update_scored_offer_sqlite_failed", error=str(exc))
            return False


async def _get_admin_settings(storage: StorageManager) -> dict[str, Any]:
    """Lê todas as configurações do admin_settings."""
    if storage._using_supabase:
        try:
            resp = await storage._supabase._client.table("admin_settings").select("key, value").execute()
            return {row["key"]: row["value"] for row in (resp.data or [])}
        except Exception:
            return {}
    return {}


async def _set_admin_setting(storage: StorageManager, key: str, value: Any) -> bool:
    """Upsert de uma configuração no admin_settings."""
    if storage._using_supabase:
        try:
            await storage._supabase._client.table("admin_settings").upsert(
                {"key": key, "value": value},
                on_conflict="key",
            ).execute()
            return True
        except Exception as exc:
            logger.warning("set_admin_setting_failed", error=str(exc))
            return False
    return False


async def _call_rpc(
    storage: StorageManager,
    fn_name: str,
    params: dict[str, Any],
) -> list[dict] | dict | None:
    """Chama uma RPC function do Supabase (async)."""
    if storage._using_supabase:
        try:
            resp = await storage._supabase._client.rpc(fn_name, params).execute()
            return resp.data
        except Exception as exc:
            logger.warning("rpc_call_failed", fn=fn_name, error=str(exc))
            return None
    return None
