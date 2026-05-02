-- =============================================================================
-- Migration 050: Allow authenticated users to read sent_offers
-- =============================================================================
-- O painel admin precisa ler sent_offers para:
-- 1. Realtime updates da fila (queue page reage a INSERT em sent_offers)
-- 2. View vw_approved_unsent (security_invoker) avalia NOT EXISTS em sent_offers

CREATE POLICY sent_offers_authenticated_read
    ON sent_offers
    FOR SELECT
    TO authenticated
    USING (true);
