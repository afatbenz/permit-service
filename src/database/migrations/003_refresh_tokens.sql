-- =====================================================================
-- DDL: REFRESH TOKENS — supports the memory + refresh access-token flow
-- used by the SPA. Rows are rotated on every refresh (old deleted, new
-- created), so a leaked token can't be replayed indefinitely.
-- Dialect: PostgreSQL 14+
-- =====================================================================

CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,          -- SHA-256 of the raw token; raw value never persisted
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON refresh_tokens
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();