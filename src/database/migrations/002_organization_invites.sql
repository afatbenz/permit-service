-- =====================================================================
-- Migration: organization_invites
-- Adds the admin-driven invite flow (Org Admin invites a user by email
-- into a specific role) as a counterpart to the existing self-register
-- flow (registration_links, for Supervisor Sub-Con only).
--
-- Run this AFTER ddl_auth_organization.sql.
-- =====================================================================

CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

CREATE TABLE organization_invites (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    role_id         UUID NOT NULL REFERENCES roles(id),
    token           VARCHAR(100) NOT NULL UNIQUE,
    status          invite_status NOT NULL DEFAULT 'pending',
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_organization_invites_org ON organization_invites(organization_id);
CREATE INDEX idx_organization_invites_email ON organization_invites(email);

CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON organization_invites
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
