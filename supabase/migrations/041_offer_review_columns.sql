-- =============================================================================
-- Migration 041: Colunas para revisao manual de ofertas no painel admin
-- =============================================================================
-- Adiciona:
--   score_breakdown  JSONB   — Composicao do score por criterio
--   approved_at      TIMESTAMPTZ — Timestamp de aprovacao (para FIFO na fila)
--   custom_title     TEXT    — Titulo curado pelo admin (com apoio de IA)
--   offer_body       TEXT    — Corpo da mensagem curado pelo admin
--   extra_notes      TEXT    — Notas/assinatura complementar

ALTER TABLE scored_offers
    ADD COLUMN IF NOT EXISTS score_breakdown  JSONB,
    ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS custom_title     TEXT,
    ADD COLUMN IF NOT EXISTS offer_body       TEXT,
    ADD COLUMN IF NOT EXISTS extra_notes      TEXT;

-- Indice para ordenacao FIFO na fila de envio
CREATE INDEX IF NOT EXISTS idx_scored_offers_approved_at
    ON scored_offers (approved_at ASC)
    WHERE approved_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Trigger: auto-set approved_at quando status muda para 'approved'
-- Limpa approved_at quando status sai de 'approved'
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_set_approved_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
        NEW.approved_at = NOW();
    END IF;
    IF NEW.status != 'approved' THEN
        NEW.approved_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_approved_at ON scored_offers;
CREATE TRIGGER trg_set_approved_at
    BEFORE UPDATE OF status ON scored_offers
    FOR EACH ROW
    EXECUTE FUNCTION fn_set_approved_at();

-- Backfill: setar approved_at para ofertas ja aprovadas (usa scored_at como fallback)
UPDATE scored_offers
SET approved_at = scored_at
WHERE status = 'approved' AND approved_at IS NULL;
