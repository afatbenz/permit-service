-- =====================================================================
-- Migration: permit_evidences
-- Evidence attachments for permits (SITE_MAP / EQUIPMENT / OTHER).
--
-- permit_id is opaque (no FK) because the permits table is not built yet.
-- Ownership is scoped through organization_id (set from the uploader's
-- organization). Add a FK from permit_id in a later migration once the
-- permits table exists.
-- =====================================================================

CREATE TABLE permit_evidences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permit_id       UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    evidence_type   VARCHAR(50) NOT NULL,        -- SITE_MAP | EQUIPMENT | OTHER
    file_name       VARCHAR(255) NOT NULL,
    mime_type       VARCHAR(50) NOT NULL,
    size_bytes      INTEGER NOT NULL,
    uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_permit_evidence_type CHECK (
        evidence_type IN ('SITE_MAP', 'EQUIPMENT', 'OTHER')
    )
);

CREATE INDEX idx_permit_evidences_permit_id ON permit_evidences(permit_id);
CREATE INDEX idx_permit_evidences_org ON permit_evidences(organization_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON permit_evidences
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
