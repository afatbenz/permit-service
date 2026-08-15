import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { Organization } from './organization.model';
import { Project } from './project.model';

/**
 * Permit category catalog. Scope columns decide visibility:
 *   global      : organization_id NULL + project_id NULL + is_system true (seeded defaults)
 *   organization: organization_id set,  project_id NULL   (schema supports; no UI yet)
 *   project     : organization_id set,  project_id set    (per-project add/override/tombstone)
 *
 * Per-project overrides work by NAME precedence (most-specific wins):
 *   - recolor a default for a project  = insert project-scoped ACTIVE row, same name, new color
 *   - remove a default for a project   = insert project-scoped 'archived' row, same name (tombstone)
 *   - re-add a removed default         = reactivate the archived project row (stable id)
 * Resolution happens in TS (tiny data), not SQL.
 * Table created by migration 007.
 */
@Table({ tableName: 'permit_categories', underscored: true, timestamps: true })
export class PermitCategory extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: true })
  organizationId: string;

  @ForeignKey(() => Project)
  @Column({ type: DataType.UUID, allowNull: true })
  projectId: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  name: string;

  @Column({ type: DataType.STRING(7), allowNull: false })
  color: string;

  /** Seeded global rows (organization_id NULL + project_id NULL). */
  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  isSystem: boolean;

  /** Seed default shared by all organizations/projects. */
  @Default(false)
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  isDefault: boolean;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  sortOrder: number;

  @Column({
    type: DataType.ENUM(...Object.values(RecordStatus)),
    defaultValue: RecordStatus.ACTIVE,
  })
  status: RecordStatus;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string;
}
