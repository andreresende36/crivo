-- Migration 018: Schema para o painel admin
-- Adiciona: admin_settings, colunas de fila em scored_offers, triggered_by em sent_offers,
--           views atualizadas, RPC functions para analytics

-- ============================================================================
-- 1. Tabela admin_settings (configurações editáveis pelo painel)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_settings_public_read"
    ON admin_settings FOR SELECT
    USING (true);

CREATE POLICY "admin_settings_service_write"
    ON admin_settings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 2. Novas colunas em scored_offers (prioridade de fila + override + notas)
-- ============================================================================
ALTER TABLE scored_offers
    ADD COLUMN IF NOT EXISTS queue_priority  INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS score_override  INTEGER,
    ADD COLUMN IF NOT EXISTS admin_notes     TEXT;

CREATE INDEX IF NOT EXISTS idx_scored_offers_queue_priority
    ON scored_offers (queue_priority DESC);

-- ============================================================================
-- 3. Nova coluna em sent_offers (quem disparou o envio)
-- ============================================================================
ALTER TABLE sent_offers
    ADD COLUMN IF NOT EXISTS triggered_by TEXT DEFAULT 'auto';

-- ============================================================================
-- 4. View atualizada: vw_approved_unsent (com prioridade de fila)
-- ============================================================================
CREATE OR REPLACE VIEW vw_approved_unsent AS
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
    so.scored_at,
    so.queue_priority,
    so.score_override,
    so.admin_notes
FROM scored_offers so
JOIN products p ON p.id = so.product_id
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN badges b ON b.id = p.badge_id
WHERE so.status = 'approved'
  AND COALESCE(so.score_override, so.final_score) >= 60
  AND NOT EXISTS (
      SELECT 1 FROM sent_offers se
      WHERE se.scored_offer_id = so.id
        AND se.sent_at >= NOW() - INTERVAL '24 hours'
  )
ORDER BY so.queue_priority DESC, COALESCE(so.score_override, so.final_score) DESC;

-- ============================================================================
-- 5. View atualizada: vw_top_deals (drop + recria por mudança de colunas)
-- ============================================================================
DROP VIEW IF EXISTS vw_top_deals;
CREATE VIEW vw_top_deals AS
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
    c.name          AS category,
    b.name          AS badge,
    so.final_score
FROM products p
JOIN scored_offers so ON so.product_id = p.id
LEFT JOIN categories c ON c.id = p.category_id
LEFT JOIN badges b ON b.id = p.badge_id
WHERE p.last_seen_at >= NOW() - INTERVAL '6 hours'
  AND so.status = 'approved'
ORDER BY so.final_score DESC, p.discount_percent DESC
LIMIT 20;

-- ============================================================================
-- 6. RPC: Distribuição de scores (histograma)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_score_distribution(hours_back INTEGER DEFAULT 24)
RETURNS TABLE(score_bucket INTEGER, count BIGINT)
LANGUAGE sql STABLE
AS $$
    SELECT
        (final_score::integer / 10) * 10 AS score_bucket,
        COUNT(*)
    FROM scored_offers
    WHERE scored_at >= NOW() - (hours_back || ' hours')::INTERVAL
    GROUP BY score_bucket
    ORDER BY score_bucket;
$$;

-- ============================================================================
-- 7. RPC: Envios por hora (hoje)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_hourly_sends(target_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(hour INTEGER, count BIGINT)
LANGUAGE sql STABLE
AS $$
    SELECT
        EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Sao_Paulo')::INTEGER AS hour,
        COUNT(*)
    FROM sent_offers
    WHERE (sent_at AT TIME ZONE 'America/Sao_Paulo')::DATE = target_date
    GROUP BY hour
    ORDER BY hour;
$$;

-- ============================================================================
-- 8. RPC: Métricas diárias (trend charts, últimos N dias)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_daily_metrics(days_back INTEGER DEFAULT 30)
RETURNS TABLE(
    day              DATE,
    products_scraped BIGINT,
    offers_scored    BIGINT,
    offers_approved  BIGINT,
    offers_sent      BIGINT,
    avg_score        NUMERIC,
    avg_discount     NUMERIC
)
LANGUAGE sql STABLE
AS $$
    SELECT
        d.day::DATE,
        COALESCE(p.cnt, 0),
        COALESCE(so.cnt, 0),
        COALESCE(soa.cnt, 0),
        COALESCE(se.cnt, 0),
        so.avg_score,
        p.avg_discount
    FROM generate_series(
        CURRENT_DATE - (days_back || ' days')::INTERVAL,
        CURRENT_DATE,
        '1 day'
    ) AS d(day)
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, ROUND(AVG(discount_percent), 1) AS avg_discount
        FROM products WHERE last_seen_at::DATE = d.day::DATE
    ) p ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt, ROUND(AVG(final_score), 1) AS avg_score
        FROM scored_offers WHERE scored_at::DATE = d.day::DATE
    ) so ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM scored_offers
        WHERE scored_at::DATE = d.day::DATE AND status = 'approved'
    ) soa ON true
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS cnt FROM sent_offers WHERE sent_at::DATE = d.day::DATE
    ) se ON true
    ORDER BY d.day;
$$;

-- ============================================================================
-- 9. RPC: Funil de conversão (últimas 24h)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_conversion_funnel(hours_back INTEGER DEFAULT 24)
RETURNS TABLE(
    scraped  BIGINT,
    scored   BIGINT,
    approved BIGINT,
    sent     BIGINT
)
LANGUAGE sql STABLE
AS $$
    SELECT
        (SELECT COUNT(*) FROM products      WHERE last_seen_at >= NOW() - (hours_back || ' hours')::INTERVAL),
        (SELECT COUNT(*) FROM scored_offers WHERE scored_at   >= NOW() - (hours_back || ' hours')::INTERVAL),
        (SELECT COUNT(*) FROM scored_offers WHERE scored_at   >= NOW() - (hours_back || ' hours')::INTERVAL AND status = 'approved'),
        (SELECT COUNT(*) FROM sent_offers   WHERE sent_at     >= NOW() - (hours_back || ' hours')::INTERVAL);
$$;
