-- =============================================================================
-- Migration 042: Atualizar vw_approved_unsent para FIFO + campos de revisao
-- =============================================================================
-- Mudancas:
--   1. Adiciona custom_title, offer_body, extra_notes, score_breakdown ao SELECT
--   2. ORDER BY muda para queue_priority DESC, approved_at ASC (FIFO)
--      com fallback para scored_at em registros pre-migration

CREATE OR REPLACE VIEW vw_approved_unsent AS
SELECT
    p.id            AS product_id,
    p.ml_id,
    p.title,
    p.current_price,
    p.original_price,
    p.pix_price,
    p.discount_percent,
    p.discount_type,
    p.free_shipping,
    p.full_shipping,
    br.name         AS brand,
    p.thumbnail_url,
    p.product_url,
    p.rating_stars,
    p.rating_count,
    p.installments_without_interest,
    p.installment_count,
    p.installment_value,
    c.name          AS category,
    b.name          AS badge,
    so.id           AS scored_offer_id,
    so.final_score,
    so.scored_at,
    so.queue_priority,
    so.score_override,
    so.admin_notes,
    so.approved_at,
    so.custom_title,
    so.offer_body,
    so.extra_notes,
    so.score_breakdown
FROM scored_offers so
JOIN products p ON p.id = so.product_id
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN badges b ON b.id = p.badge_id
LEFT JOIN brands br ON br.id = p.brand_id
WHERE so.status = 'approved'
  AND p.deleted_at IS NULL
  AND COALESCE(so.score_override, so.final_score) >= 60
  AND NOT EXISTS (
      SELECT 1 FROM sent_offers se
      WHERE se.scored_offer_id = so.id
        AND se.sent_at >= NOW() - INTERVAL '24 hours'
  )
ORDER BY so.queue_priority DESC, COALESCE(so.approved_at, so.scored_at) ASC;
