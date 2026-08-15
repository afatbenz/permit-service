/**
 * Workflow status of a permit-to-work record. Distinct from RecordStatus
 * (soft-delete state); this is the application-level workflow.
 */
export enum PermitStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
