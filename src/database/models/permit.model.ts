import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  HasMany,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { PermitStatus } from '../../common/enums/permit-status.enum';
import { Organization } from './organization.model';
import { PermitAnswer } from './permit-answer.model';
import { PermitCategory } from './permit-category.model';
import { Project } from './project.model';

/**
 * A permit-to-work record. Belongs to one project and one organization,
 * carries the work-activity metadata collected by the new-permit form, and
 * moves through the PermitStatus workflow.
 * Table created by migration 010.
 */
@Table({ tableName: 'permits', underscored: true, timestamps: true })
export class Permit extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @ForeignKey(() => Project)
  @Column({ type: DataType.UUID, allowNull: false })
  projectId: string;

  @BelongsTo(() => Project, 'projectId')
  project: Project;

  /** Chosen "Kategori Permit" driving the checklist (nullable for legacy rows). */
  @ForeignKey(() => PermitCategory)
  @Column({ type: DataType.UUID, allowNull: true })
  categoryId: string | null;

  @BelongsTo(() => PermitCategory, 'categoryId')
  category: PermitCategory;

  @HasMany(() => PermitAnswer, 'permitId')
  answers: PermitAnswer[];

  @Column({ type: DataType.STRING(50), allowNull: false })
  permitNumber: string;

  @Column({ type: DataType.STRING(500), allowNull: false })
  workTitle: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  department: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  contractorName: string;

  @Column({ type: DataType.STRING(255), allowNull: false, field: 'location_1' })
  location1: string;

  @Column({ type: DataType.STRING(255), allowNull: true, field: 'location_2' })
  location2: string | null;

  @Column({ type: DataType.STRING(100), allowNull: false })
  city: string;

  @Column({ type: DataType.STRING(100), allowNull: false })
  province: string;

  @Column({ type: DataType.DATE, allowNull: true })
  startAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  endAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  workDesc: string | null;

  @Column({
    type: DataType.STRING(20),
    defaultValue: PermitStatus.DRAFT,
  })
  status: PermitStatus;

  @Column({ type: DataType.DATE, allowNull: true })
  submittedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  approvedAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  rejectedAt: Date | null;

  @Column({ type: DataType.UUID, allowNull: true })
  approvedBy: string | null;

  @Column({ type: DataType.UUID, allowNull: true })
  rejectedBy: string | null;

  @Column({ type: DataType.STRING(500), allowNull: true })
  rejectionReason: string | null;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string | null;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string | null;
}
