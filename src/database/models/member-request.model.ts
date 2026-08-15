import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { MemberRequestStatus } from '../../common/enums/member-request-status.enum';
import { Organization } from './organization.model';
import { Project } from './project.model';
import { User } from './user.model';

/**
 * A join-by-code request awaiting org-admin approval. The matching
 * user_project_assignments row stays 'inactive' until the request is
 * approved. Table created by migration 006.
 */
@Table({ tableName: 'member_requests', underscored: true, timestamps: true })
export class MemberRequest extends Model {
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

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @Column({
    type: DataType.ENUM(...Object.values(MemberRequestStatus)),
    defaultValue: MemberRequestStatus.PENDING,
  })
  status: MemberRequestStatus;

  @Column({ type: DataType.UUID, allowNull: true })
  approvedBy: string;

  @Column({ type: DataType.DATE, allowNull: true })
  approvedAt: Date;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string;
}
