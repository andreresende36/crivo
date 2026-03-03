-- =============================================================================
-- DealHunter — Migration 001: Schema Inicial
-- Versão: 2.0 (Semana 1, Dias 3-5)
--
-- Como executar:
--   Opção A (recomendada): Supabase Dashboard → SQL Editor → New Query
--                          Cole o conteúdo de src/database/schema.sql e clique Run
--
--   Opção B: Supabase CLI
--             supabase login
--             supabase link --project-ref <SEU_PROJECT_REF>
--             supabase db push
--
-- Tabelas criadas:
--   products      — catálogo de produtos coletados pelo scraper
--   price_history — histórico de preços (detecta pricejacking)
--   scored_offers — resultado do Score Engine e IA
--   sent_offers   — controle de envios (Telegram + WhatsApp)
--   system_logs   — eventos operacionais e monitoramento
-- =============================================================================

-- O schema completo está em src/database/schema.sql
-- Este arquivo referencia o schema canônico para uso com o Supabase CLI.
-- Se usar o CLI, garanta que o schema.sql esteja acessível no path abaixo.

\i '../src/database/schema.sql'
