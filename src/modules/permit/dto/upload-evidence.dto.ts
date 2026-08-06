import { IsArray, IsIn, IsString } from 'class-validator';
import { EvidenceType } from '../../../common/enums/evidence-type.enum';

const EVIDENCE_TYPES = Object.values(EvidenceType);

/**
 * Metadata for a multipart evidence upload.
 *
 * Payload contract (multipart/form-data):
 *   files  : one file per key, appended repeatedly (`files[0]`, `files[1]`, ...)
 *   types  : a single JSON-encoded array string whose i-th element is the
 *            EvidenceType for the i-th file.
 *
 * Example (axios/fetch FormData):
 *   const fd = new FormData();
 *   fd.append('files', siteMapFile);        // index 0
 *   fd.append('files', equipmentPhoto);     // index 1
 *   fd.append('types', '["SITE_MAP","EQUIPMENT"]');
 *
 * The controller passes the parsed `types` array to PermitService, which
 * maps types[i] -> files[i]. Length mismatch is rejected there.
 */
export class UploadEvidenceDto {
  /** JSON-encoded array of EvidenceType values, aligned by file index. */
  @IsString()
  typesRaw: string;
}

export class EvidenceTypesDto {
  @IsArray()
  @IsIn(EVIDENCE_TYPES, { each: true })
  types: EvidenceType[];
}
