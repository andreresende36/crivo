-- Migration 014: Remove colunas ai_score e ai_description de scored_offers
-- Essas colunas foram planejadas para uma fase de análise por IA que foi
-- descontinuada. O score é calculado exclusivamente pelo Score Engine (regras).

DROP VIEW IF EXISTS vw_approved_unsent;

ALTER TABLE scored_offers DROP COLUMN ai_score;
ALTER TABLE scored_offers DROP COLUMN ai_description;

CREATE VIEW vw_approved_unsent AS
SELECT
    p.id            AS product_id,
    p.ml_id,
    p.title,
    p.current_price,
    p.original_price,
    p.discount_percent,
    p.free_shipping,
    p.thumbnail_url,
    p.product_url,
    c.name          AS category,
    so.id           AS scored_offer_id,
    so.final_score,
    so.scored_at
FROM scored_offers so
JOIN products p ON p.id = so.product_id
LEFT JOIN categories c ON c.id = p.category_id
WHERE so.status = 'approved'
  AND so.final_score >= 60
  AND NOT EXISTS (
    SELECT 1 FROM sent_offers se
    WHERE se.scored_offer_id = so.id
      AND se.sent_at >= now() - interval '24 hours'
  )
ORDER BY so.final_score DESC;
