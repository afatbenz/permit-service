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
import { Permit } from './permit.model';
import { PermitBankQuestion } from './permit-bank-question.model';

/**
 * One checklist answer of a permit: the picked bank question and the
 * yes/no response (answer = true for yes, false for no). A permit can hold
 * many rows (UNIQUE(permit_id, question_id)); rows are replaced wholesale
 * on create/update of a draft.
 * Table created by migration 011.
 */
@Table({ tableName: 'permit_answers', underscored: true, timestamps: true })
export class PermitAnswer extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Permit)
  @Column({ type: DataType.UUID, allowNull: false })
  permitId: string;

  @BelongsTo(() => Permit, 'permitId')
  permit: Permit;

  @ForeignKey(() => PermitBankQuestion)
  @Column({ type: DataType.UUID, allowNull: false })
  questionId: string;

  @BelongsTo(() => PermitBankQuestion, 'questionId')
  question: PermitBankQuestion;

  /** yes = true, no = false */
  @Column({ type: DataType.BOOLEAN, allowNull: false })
  answer: boolean;
}
