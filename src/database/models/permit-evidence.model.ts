import {
  Column,
  DataType,
  Default,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { EvidenceType } from '../../common/enums/evidence-type.enum';

/**
 * One evidence attachment of a permit (SITE_MAP / EQUIPMENT / OTHER).
 *
 * `permit_id` is stored as an opaque UUID for now — the permits table does
 * not exist yet. Ownership is scoped through `organizationId`, which is set
 * from the uploading user's organization at creation time. When a `permits`
 * table is introduced, add a FK from `permit_id` in a forward migration.
 */
@Table({ tableName: 'permit_evidences', underscored: true, timestamps: true })
export class PermitEvidence extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  /** Opaque permit reference (no FK yet — permits table not built). */
  @Column({ type: DataType.UUID, allowNull: false })
  permitId: string;

  /** Tenant scope used for ownership checks. */
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @Column({ type: DataType.ENUM(...Object.values(EvidenceType)), allowNull: false })
  evidenceType: EvidenceType;

  /** File name on disk (UUID.ext) under storage/evidence/. */
  @Column({ type: DataType.STRING(255), allowNull: false })
  fileName: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  mimeType: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  sizeBytes: number;

  /** Id of the user who uploaded this evidence. */
  @Column({ type: DataType.UUID, allowNull: false })
  uploadedBy: string;
}
