-- =====================================================================
-- Migration: 006_auth_org_settings
-- Supports the reworked onboarding + organization-settings flow:
--   1. organizations gains address / city / province (create-org form).
--   2. project_invitation_codes — short human-readable join codes that
--      scope a new member into a specific project under one organization.
--   3. member_requests — join-by-code requests awaiting approval by the
--      org admin (user_project_assignments stays 'inactive' until approved).
--   4. notifications — pending-approval alerts to org admins, and results
--      back to the requesting user.
-- Pure additive (new columns/tables only) — safe against the existing
-- 001/002/003/004/005 schema.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ORGANIZATIONS — location columns
-- ---------------------------------------------------------------------
ALTER TABLE organizations
    ADD COLUMN address   VARCHAR(255),
    ADD COLUMN city      VARCHAR(100),
    ADD COLUMN province  VARCHAR(100);

-- ---------------------------------------------------------------------
-- 2. PROJECT INVITATION CODES
--    One row per project code. `code` is UNIQUE platform-wide (short
--    enough that a cross-tenant collision is extremely unlikely; the
--    joining side additionally validates organization_id).
-- ---------------------------------------------------------------------
CREATE TYPE invitation_code_status AS ENUM ('active', 'revoked');

CREATE TABLE project_invitation_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    code            VARCHAR(50) NOT NULL UNIQUE,
    status          invitation_code_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_proj_invite_codes_org ON project_invitation_codes(organization_id);
CREATE INDEX idx_proj_invite_codes_project ON project_invitation_codes(project_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_invitation_codes
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 3. MEMBER REQUESTS
--    Join-by-code produces a request here; org admin approves/rejects.
--    UNIQUE (user_id, project_id) so a rejected user can re-request
--    (status flips back to pending on a fresh join attempt).
-- ---------------------------------------------------------------------
CREATE TYPE member_request_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE member_requests (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          member_request_status NOT NULL DEFAULT 'pending',
    approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_member_request_user_project UNIQUE (user_id, project_id)
);

CREATE INDEX idx_member_requests_org_status ON member_requests(organization_id, status);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON member_requests
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------
-- 4. NOTIFICATIONS
--    Lightweight in-app alerts. `data` (JSONB) carries IDs the frontend
--    needs to deep-link (e.g. { memberRequestId, projectId, userId }).
-- ---------------------------------------------------------------------
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    recipient_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(255) NOT NULL,
    message         TEXT,
    data            JSONB,
    is_read         BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_notifications_recipient_read ON notifications(recipient_id, is_read);
CREATE INDEX idx_notifications_org ON notifications(organization_id);

-- ---------------------------------------------------------------------
-- 5. PROJECT ADMIN
--    projects.project_admin_id designates the single project_admin of a
--    project (1 project = 1 project_admin). It is set automatically to the
--    first member approved into a project, or explicitly by an org_admin.
--    The 'project_admin' role is a global system role like the others.
-- ---------------------------------------------------------------------
ALTER TABLE projects
    ADD COLUMN project_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;

INSERT INTO roles (code, name, is_system_role, organization_id)
SELECT 'project_admin', 'Project Admin', true, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE code = 'project_admin' AND organization_id IS NULL
);
