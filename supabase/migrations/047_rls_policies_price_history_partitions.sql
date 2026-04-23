-- =============================================================================
-- Migration 047: Adiciona políticas RLS nas partições de price_history
-- =============================================================================
-- O Supabase Advisor exige políticas diretamente em cada partição.
-- As políticas espelham as da tabela pai (migration 038).

DO $$
DECLARE
    partitions TEXT[] := ARRAY[
        'price_history_y2026m03',
        'price_history_y2026m04',
        'price_history_y2026m05',
        'price_history_y2026m06',
        'price_history_default'
    ];
    p TEXT;
BEGIN
    FOREACH p IN ARRAY partitions LOOP
        EXECUTE FORMAT(
            'CREATE POLICY "price_history_service_read" ON public.%I FOR SELECT USING (auth.role() = ''service_role'')',
            p
        );
        EXECUTE FORMAT(
            'CREATE POLICY "price_history_service_write" ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
            p
        );
    END LOOP;
END;
$$;

-- Atualiza fn_create_price_history_partition para criar políticas em novas partições
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
        EXECUTE FORMAT(
            'CREATE POLICY "price_history_service_read" ON %I FOR SELECT USING (auth.role() = ''service_role'')',
            partition_name
        );
        EXECUTE FORMAT(
            'CREATE POLICY "price_history_service_write" ON %I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
            partition_name
        );
    END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;
