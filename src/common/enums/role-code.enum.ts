/**
 * Fixed system role codes, matching the seeded rows in the `roles` table.
 * Kept as an enum so guards/decorators get compile-time safety instead of
 * comparing raw strings scattered across the codebase.
 */
export enum RoleCode {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin',
  SUPERVISOR_SUBCON = 'supervisor_subcon',
  SUPERVISOR_MAINCON = 'supervisor_maincon',
  HSE_MAINCON = 'hse_maincon',
  CM_MAINCON = 'cm_maincon',
}
