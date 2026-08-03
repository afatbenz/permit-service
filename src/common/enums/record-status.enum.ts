/**
 * Generic record status applied to (almost) every table as a base column.
 * This is NOT the permit workflow status — see design doc section 2.
 */
export enum RecordStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  ARCHIVED = 'archived',
}
