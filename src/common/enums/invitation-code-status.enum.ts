/**
 * Lifecycle of a project invitation code. Mirrors the `invitation_code_status`
 * enum created in migration 006.
 */
export enum InvitationCodeStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
}
