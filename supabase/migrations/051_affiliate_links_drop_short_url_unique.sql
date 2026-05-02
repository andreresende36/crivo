-- 051_affiliate_links_drop_short_url_unique.sql
-- Remove unique constraint on affiliate_links.short_url.
--
-- Reason: ML's affiliate API normalizes URL tracking params on their side and
-- returns the same short_url for distinct product_id rows that map to the same
-- canonical product. The (product_id, user_id) unique constraint already
-- guarantees no duplicate rows per user; short_url uniqueness was over-strict
-- and broke batch upserts whenever two products in the batch shared a canonical
-- short URL.

ALTER TABLE affiliate_links
    DROP CONSTRAINT IF EXISTS uq_affiliate_links_short_url;

-- Keep a non-unique index for short_url lookups (e.g. reverse lookup by short URL).
CREATE INDEX IF NOT EXISTS idx_affiliate_links_short_url
    ON affiliate_links (short_url);
