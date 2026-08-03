-- =====================================================================
-- DDL: AUTH & ORGANIZATION MODULE — E-Permit Multi-Tenant Platform
-- Dialect: PostgreSQL 14+
-- Scope: organizations, roles/permissions (RBAC), users, profiles,
--        sub-con companies, projects, and the org-scoped registration
--        link mechanism discussed (self-register vs invite-by-admin).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------

-- Generic record status (base column) — NOT the permit workflow status.
CREATE TYPE record_status AS ENUM ('active', 'inactive', 'archived');

-- Verification gate for self-registered accounts (Sub-Con Supervisor).
-- Separate from record_status: a user can be status='active' but
-- verification_status='pending' while waiting for Org Admin approval.
CREATE TYPE user_verification_status AS ENUM ('pending', 'verified', 'rejected');

-- Registration link scope: an Org Admin can generate a link scoped to
-- the whole organization, or narrowed to one project.
CREATE TYPE registration_link_scope AS ENUM ('organization', 'project');


-- ---------------------------------------------------------------------
-- 1. ORGANIZATIONS
--    Tenant root. Only Super Admin can create rows here (application-
--    layer rule, not enforceable purely in SQL — enforce via RBAC
--    middleware / service layer).
-- ---------------------------------------------------------------------
CREATE TABLE organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,             -- "PT. Jaya Obayashi"
    code            VARCHAR(50)  NOT NULL UNIQUE,       -- prefix for project codes, e.g. "JO"
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,                               -- FK added later (see section 9, avoids circular dep with users)
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID
);

COMMENT ON TABLE organizations IS 'Tenant root (Main Contractor). Provisioned only by Super Admin.';


-- ---------------------------------------------------------------------
-- 2. ROLES
--    System-defined roles. organization_id nullable: NULL = global
--    system role available to every tenant (Supervisor Sub-Con,
--    Supervisor Main-Con, HSE Main-Con, CM Main-Con, Org Admin,
--    Super Admin). A non-null value allows a tenant-specific custom
--    role later if ever needed.
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code            VARCHAR(50) NOT NULL,               -- 'supervisor_subcon', 'hse_maincon', 'org_admin', 'super_admin', ...
    name            VARCHAR(100) NOT NULL,              -- display name
    description     TEXT,
    is_system_role  BOOLEAN NOT NULL DEFAULT true,       -- true = seeded, cannot be deleted from UI
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID,
    CONSTRAINT uq_roles_org_code UNIQUE (organization_id, code)
);


-- ---------------------------------------------------------------------
-- 3. PERMISSIONS + ROLE_PERMISSIONS (RBAC)
--    Fine-grained permission strings, e.g. 'permit.create',
--    'permit.review', 'permit.approve', 'admin.org.manage'.
-- ---------------------------------------------------------------------
CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = global permission catalog
    code            VARCHAR(100) NOT NULL UNIQUE,       -- 'permit.create', 'permit.approve', ...
    description     TEXT,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID
);

CREATE TABLE role_permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);


-- ---------------------------------------------------------------------
-- 4. USERS
--    Core auth table. Kept lean on purpose — profile-ish fields
--    (job title, signature) live in user_profiles.
--
--    verification_status governs the "pending until approved" gate
--    for self-registered Sub-Con Supervisors discussed earlier.
--    record `status` governs active/inactive/archived independent of
--    that verification gate.
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    subcon_company_id     UUID NULL,                    -- FK added after subcon_companies is created (section 6)
    role_id               UUID NOT NULL REFERENCES roles(id),
    name                  VARCHAR(255) NOT NULL,
    email                 VARCHAR(255) NOT NULL UNIQUE, -- global unique; see note below if per-org uniqueness is preferred instead
    phone                 VARCHAR(30),
    password_hash         VARCHAR(255) NOT NULL,
    verification_status   user_verification_status NOT NULL DEFAULT 'pending',
    verified_by           UUID,                         -- FK added later — Org Admin/Supervisor who approved the account
    verified_at           TIMESTAMPTZ,
    last_login_at         TIMESTAMPTZ,
    status                record_status NOT NULL DEFAULT 'active',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,                         -- NULL if self-registered
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by            UUID
);

-- NOTE: email UNIQUE is global across the whole platform (one login page,
-- one email = one identity). If a person could legitimately need separate
-- accounts under two different Organizations with the same email, change
-- this to: CONSTRAINT uq_users_org_email UNIQUE (organization_id, email)
-- and drop the plain UNIQUE above. Flag this for confirmation.

CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_verification_status ON users(verification_status);


-- ---------------------------------------------------------------------
-- 5. USER_PROFILES
--    1–1 with users. Holds the reusable default signature referenced
--    by permit_approvals.signature_url_snapshot at approval time.
-- ---------------------------------------------------------------------
CREATE TABLE user_profiles (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    job_title               VARCHAR(150),               -- shown on PDF, e.g. "Supervisor WAH"
    avatar_url              VARCHAR(500),
    default_signature_url   VARCHAR(500),               -- current active signature image
    signature_updated_at    TIMESTAMPTZ,
    status                  record_status NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by              UUID
);


-- ---------------------------------------------------------------------
-- 6. SUBCON_COMPANIES
--    Master list of Sub-Contractors per Organization — this is the
--    source for the "Company" dropdown at registration, filtered by
--    the organization_id resolved from the registration link.
-- ---------------------------------------------------------------------
CREATE TABLE subcon_companies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID,
    CONSTRAINT uq_subcon_org_name UNIQUE (organization_id, name)
);

CREATE INDEX idx_subcon_companies_org ON subcon_companies(organization_id);

-- Deferred FK now that subcon_companies exists.
ALTER TABLE users
    ADD CONSTRAINT fk_users_subcon_company
    FOREIGN KEY (subcon_company_id) REFERENCES subcon_companies(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------
-- 7. PROJECTS
-- ---------------------------------------------------------------------
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_code    VARCHAR(50) NOT NULL,               -- "CGK-065", "JKT-09"
    name            VARCHAR(255) NOT NULL,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID,
    CONSTRAINT uq_projects_org_code UNIQUE (organization_id, project_code)
);

CREATE INDEX idx_projects_org ON projects(organization_id);


-- ---------------------------------------------------------------------
-- 8. PROJECT_SUBCONS (pivot: which Sub-Con is active on which project)
-- ---------------------------------------------------------------------
CREATE TABLE project_subcons (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id          UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    subcon_company_id   UUID NOT NULL REFERENCES subcon_companies(id) ON DELETE CASCADE,
    status              record_status NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID,
    CONSTRAINT uq_project_subcon UNIQUE (project_id, subcon_company_id)
);


-- ---------------------------------------------------------------------
-- 9. USER_PROJECT_ASSIGNMENTS
--    Scopes a Main-Con user (Supervisor/HSE/CM) to specific projects,
--    for organizations that run many concurrent projects and don't
--    want every reviewer seeing every project.
-- ---------------------------------------------------------------------
CREATE TABLE user_project_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID,
    CONSTRAINT uq_user_project UNIQUE (user_id, project_id)
);


-- ---------------------------------------------------------------------
-- 10. REGISTRATION_LINKS
--     Governs the self-register flow: an Org Admin generates a token
--     (used as a URL/QR) scoped to one organization (and optionally one
--     project). Anyone opening that link only ever registers as
--     'supervisor_subcon', with organization_id/project_id resolved
--     from the link — never chosen by the registrant.
-- ---------------------------------------------------------------------
CREATE TABLE registration_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID NULL REFERENCES projects(id) ON DELETE CASCADE, -- NULL if org-wide link
    scope           registration_link_scope NOT NULL DEFAULT 'organization',
    token           VARCHAR(100) NOT NULL UNIQUE,        -- opaque random string used in the URL
    default_role_id UUID NOT NULL REFERENCES roles(id),  -- always resolves to 'supervisor_subcon'
    expires_at      TIMESTAMPTZ,
    max_uses        INTEGER,                             -- NULL = unlimited
    use_count        INTEGER NOT NULL DEFAULT 0,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,                                -- Org Admin who generated the link
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID
);

CREATE INDEX idx_registration_links_org ON registration_links(organization_id);


-- ---------------------------------------------------------------------
-- 11. DEFERRED FOREIGN KEYS
--     created_by / updated_by / verified_by columns above all reference
--     users(id), but users itself is one of the tables being created —
--     so these FKs are added last, after users exists, to avoid a
--     circular dependency at CREATE TABLE time.
-- ---------------------------------------------------------------------
ALTER TABLE organizations
    ADD CONSTRAINT fk_organizations_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_organizations_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE roles
    ADD CONSTRAINT fk_roles_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_roles_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE permissions
    ADD CONSTRAINT fk_permissions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_permissions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE role_permissions
    ADD CONSTRAINT fk_role_permissions_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_role_permissions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
    ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_users_verified_by FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE user_profiles
    ADD CONSTRAINT fk_user_profiles_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_user_profiles_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE subcon_companies
    ADD CONSTRAINT fk_subcon_companies_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_subcon_companies_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE projects
    ADD CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_projects_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE project_subcons
    ADD CONSTRAINT fk_project_subcons_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_project_subcons_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE user_project_assignments
    ADD CONSTRAINT fk_upa_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_upa_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE registration_links
    ADD CONSTRAINT fk_reglinks_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_reglinks_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;


-- ---------------------------------------------------------------------
-- 12. updated_at AUTO-TOUCH TRIGGER (applied to every table above)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subcon_companies FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON project_subcons FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON user_project_assignments FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON registration_links FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();


-- ---------------------------------------------------------------------
-- 13. SEED: system roles (organization_id = NULL → available to every tenant)
-- ---------------------------------------------------------------------
INSERT INTO roles (code, name, is_system_role) VALUES
    ('super_admin',        'Super Admin',                true),
    ('org_admin',          'Organization Admin',          true),
    ('supervisor_subcon',  'Supervisor - Sub-Contractor', true),
    ('supervisor_maincon', 'Supervisor - Main Contractor',true),
    ('hse_maincon',        'HSE - Main Contractor',       true),
    ('cm_maincon',         'CM - Main Contractor',        true);

-- ---------------------------------------------------------------------
-- 14. SEED: base permission catalog (extend as needed)
-- ---------------------------------------------------------------------
INSERT INTO permissions (code, description) VALUES
    ('permit.create',        'Submit a new permit application'),
    ('permit.extend',        'Submit an extension of an existing permit'),
    ('permit.review',        'Review a submitted permit (checklist + declaration)'),
    ('permit.approve',       'Give final approval on a permit'),
    ('permit.reject',        'Reject a permit at any review level'),
    ('admin.org.manage',     'Manage organization master data'),
    ('admin.user.manage',    'Manage users, roles, and registration links'),
    ('admin.checklist.manage','Manage checklist bank and approval hierarchy templates'),
    ('admin.monitoring.view','View permit monitoring and counters');
