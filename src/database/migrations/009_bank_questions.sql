-- =====================================================================
-- Migration: bank_questions
-- Checklist questions asked when a permit is submitted, grouped per
-- permit category (e.g. WAH → "Is the WAH Risk Assessment, SWP, fall
-- prevention plan available and communicated to the workforce?").
--
-- Questions are per-project: each row belongs to one project AND one
-- permit category of that project. Both an English and an Indonesian
-- phrasing are stored; the list UI shows the English version.
--
-- Removing a question = soft delete (status = 'archived'), consistent
-- with the permit_categories catalog.
-- =====================================================================

CREATE TABLE permit_bank_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    category_id     UUID NOT NULL REFERENCES permit_categories(id) ON DELETE CASCADE,
    question_en     VARCHAR(500) NOT NULL,
    question_id     VARCHAR(500) NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    status          record_status NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_bank_questions_project ON permit_bank_questions(project_id, category_id);
CREATE INDEX idx_bank_questions_org ON permit_bank_questions(organization_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON permit_bank_questions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
