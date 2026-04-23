-- =============================================================================
-- Migration 046: Corrige warnings de segurança do Supabase Advisor
-- =============================================================================
-- Problemas corrigidos:
--   1. Function Search Path Mutable → SET search_path = public em 13 funções
--   2. Extension in Public         → move pg_trgm para schema extensions
--   3. Materialized View in API    → revoga acesso público a mv_last_24h_summary
-- NOTA: "Leaked Password Protection" deve ser ativado manualmente no dashboard
--       Supabase em Authentication → Password Settings.

-- -----------------------------------------------------------------------------
-- 1. Fixa search_path em todas as funções com mutable search_path
-- -----------------------------------------------------------------------------

ALTER FUNCTION public.fn_products_on_update()
    SET search_path = public;

ALTER FUNCTION public.fn_set_updated_at()
    SET search_path = public;

ALTER FUNCTION public.fn_scored_offer_status_change()
    SET search_path = public;

ALTER FUNCTION public.fn_set_approved_at()
    SET search_path = public;

ALTER FUNCTION public.fn_cleanup_old_system_logs()
    SET search_path = public;

ALTER FUNCTION public.fn_refresh_mv_summary()
    SET search_path = public;

ALTER FUNCTION public.fn_create_price_history_partition()
    SET search_path = public;

ALTER FUNCTION public.fn_product_lowest_price(UUID)
    SET search_path = public;

ALTER FUNCTION public.fn_score_distribution(INTEGER)
    SET search_path = public;

ALTER FUNCTION public.fn_hourly_sends(DATE)
    SET search_path = public;

ALTER FUNCTION public.fn_daily_metrics(INTEGER)
    SET search_path = public;

ALTER FUNCTION public.fn_conversion_funnel(INTEGER)
    SET search_path = public;

ALTER FUNCTION public.fn_admin_offers_listing(
    TEXT, UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, INTEGER,
    TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, INTEGER, INTEGER
) SET search_path = public;

-- -----------------------------------------------------------------------------
-- 2. Move extensão pg_trgm do schema public para extensions
-- -----------------------------------------------------------------------------

DROP EXTENSION IF EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 3. Revoga acesso público à materialized view mv_last_24h_summary
-- -----------------------------------------------------------------------------
-- A view é consumida apenas pelo service_role (backend), não precisa ser
-- acessível diretamente por usuários anon ou authenticated via PostgREST.

REVOKE SELECT ON public.mv_last_24h_summary FROM anon, authenticated;
