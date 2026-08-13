-- =====================================================================
-- Migration: project_categories
-- Permit categories catalog. Scope columns decide visibility:
--   global      : organization_id NULL + project_id NULL + is_system true (seeded defaults)
--   organization: organization_id set,  project_id NULL   (schema supports; no UI yet)
--   project     : organization_id set,  project_id set    (per-project add/override/tombstone)
--
-- Per-project overrides work by NAME precedence (most-specific wins):
--   - recolor a default for a project  = insert project-scoped ACTIVE row, same name, new color
--   - remove a default for a project   = insert project-scoped 'archived' row, same name (tombstone)
--   - re-add a removed default         = reactivate the archived project row (stable id)
-- Resolution happens in TS (tiny data), not SQL.
-- =====================================================================

CREATE TABLE permit_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7) NOT NULL,
    is_system       BOOLEAN NOT NULL DEFAULT false,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_permit_categories_scope CHECK (
        (project_id IS NULL AND organization_id IS NULL)
        OR (project_id IS NULL AND organization_id IS NOT NULL)
        OR (project_id IS NOT NULL AND organization_id IS NOT NULL)
    ),
    CONSTRAINT chk_permit_categories_color CHECK (color ~ '^#[0-9A-F]{6}$')
);

-- NULL-safe dedupe per (organization, project, name).
CREATE UNIQUE INDEX uq_permit_categories_scope_name ON permit_categories (
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(project_id,      '00000000-0000-0000-0000-000000000000'::uuid),
    name
);

CREATE INDEX idx_permit_categories_project ON permit_categories(project_id);
CREATE INDEX idx_permit_categories_org ON permit_categories(organization_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON permit_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Default categories for all organizations and projects.
INSERT INTO permit_categories (name, color, is_system, is_default, sort_order)
SELECT * FROM (VALUES
    ('General Permit',   '#0284C7', true, true, 10),
    ('WAH',              '#D97706', true, true, 20),
    ('Confined Space',   '#7C3AED', true, true, 30),
    ('Electrical',       '#EAB308', true, true, 40),
    ('Lifting',          '#DC2626', true, true, 50),
    ('Pekerjaan Panas',  '#EA580C', true, true, 60),
    ('Pekerjaan Galian', '#059669', true, true, 70)
) AS v(name, color, is_system, is_default, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM permit_categories
    WHERE organization_id IS NULL AND project_id IS NULL AND name = v.name
);
