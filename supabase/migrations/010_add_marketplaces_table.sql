-- Migration 010: Tabela de marketplaces + FK em products

-- Tabela de lookup para marketplaces suportados
CREATE TABLE IF NOT EXISTS marketplaces (
    id          UUID    DEFAULT uuid_generate_v4() PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE marketplaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplaces_public_read"
    ON marketplaces FOR SELECT USING (true);

CREATE POLICY "marketplaces_service_write"
    ON marketplaces FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- FK em products
ALTER TABLE products ADD COLUMN IF NOT EXISTS marketplace_id UUID REFERENCES marketplaces(id);

CREATE INDEX IF NOT EXISTS idx_products_marketplace_id ON products(marketplace_id);
