import {
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { Organization } from './organization.model';
import { PermitCategory } from './permit-category.model';
import { Project } from './project.model';

/**
 * Checklist question asked at permit submission, scoped to one project and
 * one permit category of that project. Both English and Indonesian phrasings
 * are stored; the Bank Question list shows the English version.
 * Removing a question is a soft delete (status = 'archived').
 * Table created by migration 009.
 */
@Table({ tableName: 'permit_bank_questions', underscored: true, timestamps: true })
export class PermitBankQuestion extends Model {
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

  @ForeignKey(() => PermitCategory)
  @Column({ type: DataType.UUID, allowNull: false })
  categoryId: string;

  @Column({ type: DataType.STRING(500), allowNull: false })
  questionEn: string;

  @Column({ type: DataType.STRING(500), allowNull: false })
  questionId: string;

  @Default(0)
  @Column({ type: DataType.INTEGER, allowNull: false })
  sortOrder: number;

  @Column({
    type: DataType.ENUM(...Object.values(RecordStatus)),
    defaultValue: RecordStatus.ACTIVE,
  })
  status: RecordStatus;

  @BelongsTo(() => PermitCategory, 'categoryId')
  category: PermitCategory;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string;
}
