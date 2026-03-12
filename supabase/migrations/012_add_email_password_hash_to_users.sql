-- Migration 012: Adiciona email e password_hash à tabela users

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email         TEXT,
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(email) WHERE email IS NOT NULL;
