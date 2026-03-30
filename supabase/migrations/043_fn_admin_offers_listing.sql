-- =============================================================================
-- Migration 043: RPC para listagem server-side de ofertas no painel admin
-- =============================================================================
-- Funcao paginada com filtros combinaveis, ordenacao, e contadores de status.

CREATE OR REPLACE FUNCTION fn_admin_offers_listing(
    p_status      TEXT    DEFAULT NULL,   -- 'pending', 'in_queue', 'sent', 'rejected' ou NULL = todas
    p_category_id UUID    DEFAULT NULL,
    p_search      TEXT    DEFAULT NULL,
    p_min_price   NUMERIC DEFAULT NULL,
    p_max_price   NUMERIC DEFAULT NULL,
    p_min_discount NUMERIC DEFAULT NULL,
    p_min_score   INTEGER DEFAULT NULL,
    p_date_from   TIMESTAMPTZ DEFAULT NULL,
    p_date_to     TIMESTAMPTZ DEFAULT NULL,
    p_sort_by     TEXT    DEFAULT 'score', -- 'score', 'price', 'discount', 'title', 'date'
    p_sort_dir    TEXT    DEFAULT 'desc',  -- 'asc' ou 'desc'
    p_page        INTEGER DEFAULT 1,
    p_page_size   INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_offset   INTEGER;
    v_offers   JSONB;
    v_total    BIGINT;
    v_counts   JSONB;
BEGIN
    v_offset := (GREATEST(p_page, 1) - 1) * GREATEST(p_page_size, 1);

    -- Contadores globais (nao afetados pelos filtros de busca)
    SELECT jsonb_build_object(
        'pending',  COUNT(*) FILTER (WHERE so2.status = 'pending'),
        'in_queue', COUNT(*) FILTER (WHERE so2.status = 'approved'
                        AND NOT EXISTS (
                            SELECT 1 FROM sent_offers se
                            WHERE se.scored_offer_id = so2.id
                              AND se.sent_at >= NOW() - INTERVAL '24 hours'
                        )),
        'sent',     COUNT(*) FILTER (WHERE EXISTS (
                            SELECT 1 FROM sent_offers se
                            WHERE se.scored_offer_id = so2.id
                              AND se.sent_at >= NOW() - INTERVAL '24 hours'
                        )),
        'rejected', COUNT(*) FILTER (WHERE so2.status = 'rejected')
    )
    INTO v_counts
    FROM scored_offers so2
    JOIN products p2 ON p2.id = so2.product_id AND p2.deleted_at IS NULL;

    -- Total filtrado
    SELECT COUNT(*)
    INTO v_total
    FROM scored_offers so
    JOIN products p ON p.id = so.product_id AND p.deleted_at IS NULL
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE TRUE
      AND (p_status IS NULL OR (
          CASE p_status
              WHEN 'pending'  THEN so.status = 'pending'
              WHEN 'rejected' THEN so.status = 'rejected'
              WHEN 'in_queue' THEN so.status = 'approved'
                  AND NOT EXISTS (SELECT 1 FROM sent_offers se WHERE se.scored_offer_id = so.id AND se.sent_at >= NOW() - INTERVAL '24 hours')
              WHEN 'sent' THEN
                  EXISTS (SELECT 1 FROM sent_offers se WHERE se.scored_offer_id = so.id AND se.sent_at >= NOW() - INTERVAL '24 hours')
              ELSE TRUE
          END
      ))
      AND (p_category_id IS NULL OR p.category_id = p_category_id)
      AND (p_search IS NULL OR p_search = '' OR
           p.title ILIKE '%' || p_search || '%' OR
           p.ml_id ILIKE '%' || p_search || '%' OR
           c.name  ILIKE '%' || p_search || '%')
      AND (p_min_price IS NULL OR p.current_price >= p_min_price)
      AND (p_max_price IS NULL OR p.current_price <= p_max_price)
      AND (p_min_discount IS NULL OR p.discount_percent >= p_min_discount)
      AND (p_min_score IS NULL OR so.final_score >= p_min_score)
      AND (p_date_from IS NULL OR so.scored_at >= p_date_from)
      AND (p_date_to IS NULL OR so.scored_at <= p_date_to);

    -- Buscar pagina com dados
    SELECT COALESCE(jsonb_agg(row_order), '[]'::jsonb)
    INTO v_offers
    FROM (
        SELECT jsonb_build_object(
            'scored_offer_id', so.id,
            'product_id',      so.product_id,
            'final_score',     so.final_score,
            'status',          so.status,
            'scored_at',       so.scored_at,
            'queue_priority',  so.queue_priority,
            'score_override',  so.score_override,
            'admin_notes',     so.admin_notes,
            'score_breakdown', so.score_breakdown,
            'approved_at',     so.approved_at,
            'custom_title',    so.custom_title,
            'offer_body',      so.offer_body,
            'extra_notes',     so.extra_notes,
            'ml_id',           p.ml_id,
            'title',           p.title,
            'current_price',   p.current_price,
            'original_price',  p.original_price,
            'pix_price',       p.pix_price,
            'discount_percent', p.discount_percent,
            'thumbnail_url',   p.thumbnail_url,
            'product_url',     p.product_url,
            'free_shipping',   p.free_shipping,
            'rating_stars',    p.rating_stars,
            'rating_count',    p.rating_count,
            'installments_without_interest', p.installments_without_interest,
            'category_name',   c.name,
            'badge_name',      b.name,
            'brand_name',      br.name,
            'lowest_price',    (SELECT MIN(ph.price) FROM price_history ph WHERE ph.product_id = p.id),
            'sent_at',         (SELECT MAX(se.sent_at) FROM sent_offers se WHERE se.scored_offer_id = so.id),
            'display_status',  CASE
                WHEN EXISTS (SELECT 1 FROM sent_offers se WHERE se.scored_offer_id = so.id AND se.sent_at >= NOW() - INTERVAL '24 hours')
                    THEN 'sent'
                WHEN so.status = 'approved' THEN 'in_queue'
                ELSE so.status
            END
        ) AS row_order
        FROM scored_offers so
        JOIN products p ON p.id = so.product_id AND p.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN badges b ON b.id = p.badge_id
        LEFT JOIN brands br ON br.id = p.brand_id
        WHERE TRUE
          AND (p_status IS NULL OR (
              CASE p_status
                  WHEN 'pending'  THEN so.status = 'pending'
                  WHEN 'rejected' THEN so.status = 'rejected'
                  WHEN 'in_queue' THEN so.status = 'approved'
                      AND NOT EXISTS (SELECT 1 FROM sent_offers se WHERE se.scored_offer_id = so.id AND se.sent_at >= NOW() - INTERVAL '24 hours')
                  WHEN 'sent' THEN
                      EXISTS (SELECT 1 FROM sent_offers se WHERE se.scored_offer_id = so.id AND se.sent_at >= NOW() - INTERVAL '24 hours')
                  ELSE TRUE
              END
          ))
          AND (p_category_id IS NULL OR p.category_id = p_category_id)
          AND (p_search IS NULL OR p_search = '' OR
               p.title ILIKE '%' || p_search || '%' OR
               p.ml_id ILIKE '%' || p_search || '%' OR
               c.name  ILIKE '%' || p_search || '%')
          AND (p_min_price IS NULL OR p.current_price >= p_min_price)
          AND (p_max_price IS NULL OR p.current_price <= p_max_price)
          AND (p_min_discount IS NULL OR p.discount_percent >= p_min_discount)
          AND (p_min_score IS NULL OR so.final_score >= p_min_score)
          AND (p_date_from IS NULL OR so.scored_at >= p_date_from)
          AND (p_date_to IS NULL OR so.scored_at <= p_date_to)
        ORDER BY
            CASE WHEN p_sort_by = 'score'    AND p_sort_dir = 'desc' THEN so.final_score END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'score'    AND p_sort_dir = 'asc'  THEN so.final_score END ASC  NULLS LAST,
            CASE WHEN p_sort_by = 'price'    AND p_sort_dir = 'desc' THEN p.current_price END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'price'    AND p_sort_dir = 'asc'  THEN p.current_price END ASC  NULLS LAST,
            CASE WHEN p_sort_by = 'discount' AND p_sort_dir = 'desc' THEN p.discount_percent END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'discount' AND p_sort_dir = 'asc'  THEN p.discount_percent END ASC  NULLS LAST,
            CASE WHEN p_sort_by = 'title'    AND p_sort_dir = 'desc' THEN p.title END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'title'    AND p_sort_dir = 'asc'  THEN p.title END ASC  NULLS LAST,
            CASE WHEN p_sort_by = 'date'     AND p_sort_dir = 'desc' THEN so.scored_at END DESC NULLS LAST,
            CASE WHEN p_sort_by = 'date'     AND p_sort_dir = 'asc'  THEN so.scored_at END ASC  NULLS LAST,
            so.final_score DESC NULLS LAST  -- tiebreaker padrao
        LIMIT p_page_size
        OFFSET v_offset
    ) sub;

    RETURN jsonb_build_object(
        'offers', v_offers,
        'total',  v_total,
        'counts', v_counts
    );
END;
$$;
