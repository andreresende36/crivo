-- Migration 017: Adiciona coluna pix_price à tabela products
-- Preço com desconto Pix/boleto (NULL quando não há desconto de meio de pagamento)
-- Atualiza views para incluir pix_price

-- 1. Adiciona coluna pix_price
ALTER TABLE products ADD COLUMN IF NOT EXISTS pix_price DECIMAL(10,2);

-- 2. Recria views com pix_price (DROP necessário pois coluna nova altera a ordem)
DROP VIEW IF EXISTS vw_approved_unsent;
DROP VIEW IF EXISTS vw_top_deals;

CREATE VIEW vw_approved_unsent AS
SELECT
    p.id            AS product_id,
    p.ml_id,
    p.title,
    p.current_price,
    p.original_price,
    p.pix_price,
    p.discount_percent,
    p.free_shipping,
    p.thumbnail_url,
    p.product_url,
    p.rating_stars,
    p.rating_count,
    p.installments_without_interest,
    c.name          AS category,
    b.name          AS badge,
    so.id           AS scored_offer_id,
    so.final_score,
    so.scored_at
FROM scored_offers so
JOIN products p ON p.id = so.product_id
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN badges b ON b.id = p.badge_id
WHERE so.status = 'approved'
  AND so.final_score >= 60
  AND NOT EXISTS (
      SELECT 1 FROM sent_offers se
      WHERE se.scored_offer_id = so.id
        AND se.sent_at >= NOW() - INTERVAL '24 hours'
  )
ORDER BY so.final_score DESC;

CREATE VIEW vw_top_deals AS
SELECT
    p.ml_id,
    p.title,
    p.current_price,
    p.original_price,
    p.pix_price,
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
