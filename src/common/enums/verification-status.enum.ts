/**
 * Verification gate for self-registered accounts (Supervisor Sub-Con).
 * Separate from RecordStatus: a user can be status=active but still
 * verification_status=pending while waiting for Org Admin approval.
 */
export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}
