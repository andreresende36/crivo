-- Migration 009: Cria views analíticas
-- Ofertas aprovadas prontas para envio (score >= 60, ainda não enviadas hoje)
CREATE OR REPLACE VIEW vw_approved_unsent AS
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
        AND se.sent_at >= NOW() - INTERVAL '24 hours'
  )
ORDER BY so.final_score DESC;

-- Resumo das últimas 24 horas
CREATE OR REPLACE VIEW vw_last_24h_summary AS
SELECT
    (SELECT COUNT(*) FROM products      WHERE last_seen_at >= NOW() - INTERVAL '24 hours')  AS products_scraped,
    (SELECT COUNT(*) FROM scored_offers WHERE scored_at   >= NOW() - INTERVAL '24 hours')  AS offers_scored,
    (SELECT COUNT(*) FROM scored_offers WHERE scored_at   >= NOW() - INTERVAL '24 hours'
                                         AND status = 'approved')                           AS offers_approved,
    (SELECT COUNT(*) FROM sent_offers   WHERE sent_at     >= NOW() - INTERVAL '24 hours')  AS offers_sent,
    (SELECT ROUND(AVG(final_score),1)
       FROM scored_offers WHERE scored_at >= NOW() - INTERVAL '24 hours')                  AS avg_score,
    (SELECT MAX(discount_percent)
       FROM products WHERE last_seen_at  >= NOW() - INTERVAL '24 hours')                   AS max_discount_pct;

-- Top produtos por desconto (últimas 6h)
CREATE OR REPLACE VIEW vw_top_deals AS
SELECT
    p.ml_id,
    p.title,
    p.current_price,
    p.original_price,
    p.discount_percent,
    p.free_shipping,
    c.name          AS category,
    so.final_score,
    p.product_url
FROM products p
JOIN scored_offers so ON so.product_id = p.id
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.last_seen_at >= NOW() - INTERVAL '6 hours'
  AND so.status = 'approved'
ORDER BY so.final_score DESC, p.discount_percent DESC
LIMIT 20;
