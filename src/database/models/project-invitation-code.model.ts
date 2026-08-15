import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { InvitationCodeStatus } from '../../common/enums/invitation-code-status.enum';
import { Organization } from './organization.model';
import { Project } from './project.model';

/**
 * Short human-readable join codes scoped to one project (hence one
 * organization). Code is UNIQUE platform-wide; the join flow additionally
 * validates the owning organization matches the joining user.
 * Table created by migration 006.
 */
@Table({ tableName: 'project_invitation_codes', underscored: true, timestamps: true })
export class ProjectInvitationCode extends Model {
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

  @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
  code: string;

  @Column({
    type: DataType.ENUM(...Object.values(InvitationCodeStatus)),
    defaultValue: InvitationCodeStatus.ACTIVE,
  })
  status: InvitationCodeStatus;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string;
}
