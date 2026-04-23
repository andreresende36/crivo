-- =============================================================================
-- Migration 045: Corrige avisos de segurança do Supabase Advisor
-- =============================================================================
-- Problemas corrigidos:
--   1. Views com SECURITY DEFINER → alteradas para SECURITY INVOKER
--   2. RLS desabilitado nas partições de price_history → habilitado em cada partição

-- -----------------------------------------------------------------------------
-- 1. Corrige SECURITY DEFINER nas views
-- -----------------------------------------------------------------------------
-- O PostgreSQL 15+ suporta security_invoker como opção de view.
-- Com security_invoker = true, a view usa as permissões do usuário que a consulta
-- (comportamento correto para RLS funcionar adequadamente).

ALTER VIEW public.vw_approved_unsent SET (security_invoker = true);
ALTER VIEW public.vw_top_deals SET (security_invoker = true);

-- -----------------------------------------------------------------------------
-- 2. Habilita RLS nas partições de price_history
-- -----------------------------------------------------------------------------
-- O RLS foi habilitado na tabela pai (price_history) na migration 038,
-- mas as partições individuais precisam ter RLS habilitado separadamente.
-- As políticas da tabela pai são herdadas automaticamente.

ALTER TABLE public.price_history_y2026m03 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history_y2026m04 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history_y2026m05 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history_y2026m06 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history_default  ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. Garante que partições futuras também tenham RLS
-- -----------------------------------------------------------------------------
-- Atualiza a função de criação de partições para incluir ENABLE ROW LEVEL SECURITY

CREATE OR REPLACE FUNCTION fn_create_price_history_partition()
RETURNS VOID AS $$
DECLARE
    partition_date DATE := DATE_TRUNC('month', NOW() + INTERVAL '2 months');
    partition_name TEXT := 'price_history_y' || TO_CHAR(partition_date, 'YYYY') || 'm' || TO_CHAR(partition_date, 'MM');
    start_date TEXT := TO_CHAR(partition_date, 'YYYY-MM-DD');
    end_date   TEXT := TO_CHAR(partition_date + INTERVAL '1 month', 'YYYY-MM-DD');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
        EXECUTE FORMAT(
            'CREATE TABLE %I PARTITION OF price_history FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
        EXECUTE FORMAT('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);
    END IF;
END;
$$ LANGUAGE plpgsql;
