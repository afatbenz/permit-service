import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { InviteStatus } from '../../common/enums/invite-status.enum';
import { Organization } from './organization.model';
import { Project } from './project.model';
import { Role } from './role.model';

/**
 * Admin-driven invite flow: Org Admin (or Super Admin) invites someone by
 * email into a specific role (Supervisor Main-Con, HSE, CM, Org Admin).
 * This is the counterpart to RegistrationLink, which is the *self-register*
 * flow for Supervisor Sub-Con only.
 *
 * NOTE: this table was not part of the original auth/organization DDL —
 * see src/database/migrations/002_organization_invites.sql to add it.
 */
@Table({ tableName: 'organization_invites', underscored: true, timestamps: true })
export class OrganizationInvite extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @ForeignKey(() => Project)
  @Column({ type: DataType.UUID, allowNull: true })
  projectId: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  email: string;

  @ForeignKey(() => Role)
  @Column({ type: DataType.UUID, allowNull: false })
  roleId: string;

  @Column({ type: DataType.STRING(100), allowNull: false, unique: true })
  token: string;

  @Column({
    type: DataType.ENUM(...Object.values(InviteStatus)),
    defaultValue: InviteStatus.PENDING,
  })
  status: InviteStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  acceptedAt: Date;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string;
}
