-- =============================================================================
-- Crivo — Migration: add_scored_offers_product_id_unique
-- Versão: 20260310000000
--
-- Adiciona unique constraint em scored_offers.product_id para garantir
-- que cada produto tenha no máximo um scored_offer ativo.
-- Permite uso de upsert com on_conflict="product_id".
-- =============================================================================

ALTER TABLE scored_offers
    ADD CONSTRAINT scored_offers_product_id_unique UNIQUE (product_id);
