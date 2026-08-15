-- Per-project roles. A user_project_assignments row now carries the role the
-- user holds *within that project* (project_admin / supervisor_subcon / ...),
-- distinct from users.role_id which keeps only the global admin gate.
ALTER TABLE user_project_assignments ADD COLUMN role_id UUID REFERENCES roles(id);

-- Backfill every existing assignment (active + inactive) with its user's
-- current global role so the column can be NOT NULL.
UPDATE user_project_assignments upa
   SET role_id = u.role_id
  FROM users u
 WHERE upa.user_id = u.id;

ALTER TABLE user_project_assignments ALTER COLUMN role_id SET NOT NULL;

CREATE INDEX idx_upma_role_id ON user_project_assignments(role_id);
