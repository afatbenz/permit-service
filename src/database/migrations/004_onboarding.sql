-- =====================================================================
-- Migration: 004_onboarding
-- Supports the general self-register → create/join-organization flow.
--
-- 1. A sentinel organization for accounts that haven't chosen an org yet.
--    users.organization_id is NOT NULL, so brand-new "unassigned" accounts
--    point here until they Create/Join a real organization. It is not a real
--    tenant — no projects/permits live under it.
-- 2. The global 'unassigned' role (organization_id = NULL, like the other
--    system roles) for accounts in that pre-onboarding state. It matches no
--    @Roles(...) guard, so such accounts can't touch role-gated endpoints.
-- =====================================================================

INSERT INTO organizations (name, code)
VALUES ('__PENDING_ORG__', 'PENDING')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (code, name, is_system_role, organization_id)
SELECT 'unassigned', 'Unassigned', true, NULL
WHERE NOT EXISTS (
    SELECT 1 FROM roles WHERE code = 'unassigned' AND organization_id IS NULL
);
