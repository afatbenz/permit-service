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
import { Project } from './project.model';
import { Role } from './role.model';
import { User } from './user.model';

/**
 * Pivot scoping a user to a project. Status uses the generic `record_status`
 * enum: a freshly joined member is 'inactive' until their member_requests
 * row is approved by the org admin, then flips to 'active'.
 * `role_id` (added by migration 008) is the role the user holds *within this
 * project* — distinct from users.role_id, which only gates admin access.
 * Table created by migration 001.
 */
@Table({ tableName: 'user_project_assignments', underscored: true, timestamps: true })
export class UserProjectAssignment extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @ForeignKey(() => Project)
  @Column({ type: DataType.UUID, allowNull: false })
  projectId: string;

  @ForeignKey(() => Role)
  @Column({ type: DataType.UUID, allowNull: false })
  roleId: string;

  @BelongsTo(() => User, 'userId')
  user: User;

  @BelongsTo(() => Project, 'projectId')
  project: Project;

  @BelongsTo(() => Role, 'roleId')
  role: Role;

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
