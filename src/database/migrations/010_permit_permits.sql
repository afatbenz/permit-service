-- =====================================================================
-- Migration: permits
-- The core permit-to-work record. Every permit belongs to one project and
-- one organization, carries the work-activity metadata the new-permit form
-- collects, and moves through the workflow statuses defined in
-- design-doc §2 (draft → submitted → {approved, rejected} / evidence).
--
-- `permit_evidences.permit_id` is currently an opaque UUID without a FK
-- (the permits table did not exist when 005 ran). This migration adds the
-- FK as a MATCHING constraint. Evidence rows whose permit_id does not match
-- any permit (e.g. legacy test rows) are KEPT — they simply stay without
-- the FK (the column is nullable). No existing rows are deleted.
-- =====================================================================

CREATE TABLE permits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Work-activity metadata (from the new-permit form).
    permit_number   VARCHAR(50)  NOT NULL,
    work_title      VARCHAR(500) NOT NULL,
    department      VARCHAR(100) NOT NULL,
    contractor_name VARCHAR(255) NOT NULL,
    location_1      VARCHAR(255) NOT NULL,
    location_2      VARCHAR(255),
    city            VARCHAR(100) NOT NULL,
    province        VARCHAR(100) NOT NULL,
    start_at        TIMESTAMPTZ,
    end_at          TIMESTAMPTZ,
    work_desc       TEXT,

    -- Workflow.
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft',
    submitted_at    TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    rejected_at     TIMESTAMPTZ,
    approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    rejected_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason VARCHAR(500),

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_permits_project ON permits(project_id);
CREATE INDEX idx_permits_org ON permits(organization_id);
CREATE INDEX idx_permits_status ON permits(status);

-- Link matching evidence rows to the (now real) permits table. Legacy rows
-- whose permit_id has no permit are left untouched — they keep the opaque
-- reference, no FK applies.
ALTER TABLE permit_evidences
    ADD CONSTRAINT fk_evidences_permit
    FOREIGN KEY (permit_id) REFERENCES permits(id) ON DELETE CASCADE;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON permits
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
