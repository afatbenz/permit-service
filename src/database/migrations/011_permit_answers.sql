-- =====================================================================
-- Migration: permit_answers
-- Checklist answers attached to a permit. Each permit's new-permit form
-- collects a subset of the project's bank questions (filtered by the
-- chosen "Kategori Permit"); this table persists those question_id →
-- answer pairs. A permit can hold many question_ids (UNIQUE(permit_id,
-- question_id) prevents duplicate rows for the same question).
--
-- `answer` is a boolean: yes = true, no = false.
--
-- Also adds permits.category_id (the chosen permit category) — nullable,
-- the form makes it required going forward but existing rows have none.
-- =====================================================================

ALTER TABLE permits
    ADD COLUMN category_id UUID REFERENCES permit_categories(id) ON DELETE SET NULL;

CREATE TABLE permit_answers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permit_id   UUID NOT NULL REFERENCES permits(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES permit_bank_questions(id) ON DELETE CASCADE,
    answer      BOOLEAN NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_permit_answers_permit_question UNIQUE (permit_id, question_id)
);

CREATE INDEX idx_permit_answers_permit ON permit_answers(permit_id);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON permit_answers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
