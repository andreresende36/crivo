-- =============================================================================
-- DealHunter — Migration 003: Remove seller_name column
--
-- The seller_name field is no longer collected by the scraper.
-- =============================================================================

ALTER TABLE products DROP COLUMN IF EXISTS seller_name;
