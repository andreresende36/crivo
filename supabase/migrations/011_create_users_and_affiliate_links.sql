-- Migration 011: Tabelas users e affiliate_links

-- users: usuários do sistema (multi-tenancy para afiliados)
CREATE TABLE IF NOT EXISTS users (
    id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    name            TEXT        NOT NULL,
    affiliate_tag   TEXT        NOT NULL,
    ml_cookies      JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_affiliate_tag ON users(affiliate_tag);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_public_read"
    ON users FOR SELECT USING (true);

CREATE POLICY "users_service_write"
    ON users FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- affiliate_links: links de afiliado por produto × usuário
CREATE TABLE IF NOT EXISTS affiliate_links (
    id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
    product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    short_url       TEXT        NOT NULL,
    long_url        TEXT,
    ml_link_id      TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (product_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_links_product_id ON affiliate_links(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_user_id ON affiliate_links(user_id);

ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliate_links_public_read"
    ON affiliate_links FOR SELECT USING (true);

CREATE POLICY "affiliate_links_service_write"
    ON affiliate_links FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
