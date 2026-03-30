-- =============================================================================
-- Migration 044: Funcao para buscar menor preco historico de um produto
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_product_lowest_price(p_product_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE
AS $$
    SELECT MIN(price) FROM price_history WHERE product_id = p_product_id;
$$;
