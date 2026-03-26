-- Migration 019: Cria tabela title_examples
-- Armazena exemplos de títulos aprovados/editados pelo admin para treinamento few-shot.
-- NOTA: Esta migration foi aplicada ao Supabase (versão 20260320031515) antes da
--       admin_panel_schema (018 local / versão 20260320192807). O arquivo local foi
--       criado retroativamente para manter o repositório consistente.

CREATE TABLE IF NOT EXISTS title_examples (
    id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    scored_offer_id UUID        REFERENCES scored_offers(id) ON DELETE SET NULL,
    product_title   TEXT        NOT NULL,
    category        TEXT,
    price           DECIMAL(10,2),
    generated_title TEXT        NOT NULL,
    final_title     TEXT        NOT NULL,
    action          TEXT        NOT NULL CHECK (action IN ('approved', 'edited', 'timeout')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE title_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "title_examples_public_read"
    ON title_examples FOR SELECT
    USING (true);

CREATE POLICY "title_examples_service_write"
    ON title_examples FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_title_examples_action
    ON title_examples(action);

CREATE INDEX IF NOT EXISTS idx_title_examples_created_at
    ON title_examples(created_at DESC);
