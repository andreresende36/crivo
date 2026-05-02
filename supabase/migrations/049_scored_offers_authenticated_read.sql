-- =============================================================================
-- Migration 049: Allow authenticated users to read scored_offers
-- =============================================================================
-- A view vw_approved_unsent usa security_invoker=true. O frontend admin
-- acessa com chave anon/authenticated — sem esta policy, o RLS bloqueia
-- o SELECT na tabela base e a view retorna vazio.

CREATE POLICY scored_offers_authenticated_read
    ON scored_offers
    FOR SELECT
    TO authenticated
    USING (true);
