import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { Organization } from './organization.model';
import { User } from './user.model';

/**
 * Lightweight in-app alert (pending member-join approvals, join results).
 * `data` is a JSONB blob carrying IDs for deep-linking on the frontend.
 * Table created by migration 006.
 */
@Table({ tableName: 'notifications', underscored: true, timestamps: false })
export class Notification extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  recipientId: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  type: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  title: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  message: string;

  @Column({ type: DataType.JSONB, allowNull: true })
  data: Record<string, unknown>;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  isRead: boolean;

  @Default(DataType.NOW)
  @Column({ type: DataType.DATE, allowNull: false })
  createdAt: Date;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;
}
