/**
 * Lifecycle of a join-by-code member request. Mirrors the
 * `member_request_status` enum created in migration 006. A user is not an
 * active project member until the org admin approves the request.
 */
export enum MemberRequestStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
