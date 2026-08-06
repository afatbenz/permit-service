/**
 * Categorises a permit evidence attachment.
 *
 * Values are business-defined and easy to extend as the permit workflow
 * grows — add a new entry here (and to the DB ENUM migration if you switch
 * the column to a native Postgres enum) when a new evidence kind appears.
 *
 * Examples for a permit-to-work context:
 *  - SITE_MAP  → site/work-area layout diagram
 *  - EQUIPMENT → photos/scan of the equipment being used
 *  - OTHER     → fallback for anything not covered above
 */
export enum EvidenceType {
  SITE_MAP = 'SITE_MAP',
  EQUIPMENT = 'EQUIPMENT',
  OTHER = 'OTHER',
}
