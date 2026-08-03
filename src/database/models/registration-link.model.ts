import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { Organization } from './organization.model';
import { Project } from './project.model';
import { Role } from './role.model';

export enum RegistrationLinkScope {
  ORGANIZATION = 'organization',
  PROJECT = 'project',
}

/**
 * Org-scoped self-register link (URL/QR) used by Supervisor Sub-Con to
 * register without an admin having to create the account manually.
 * Role is always resolved from `defaultRoleId` — never chosen by the
 * registrant — see AuthService.register().
 */
@Table({ tableName: 'registration_links', underscored: true, timestamps: true })
export class RegistrationLink extends Model {
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

  @Column({
    type: DataType.ENUM(...Object.values(RegistrationLinkScope)),
    defaultValue: RegistrationLinkScope.ORGANIZATION,
  })
  scope: RegistrationLinkScope;

  @Column({ type: DataType.STRING(100), allowNull: false, unique: true })
  token: string;

  @ForeignKey(() => Role)
  @Column({ type: DataType.UUID, allowNull: false })
  defaultRoleId: string;

  @Column({ type: DataType.DATE, allowNull: true })
  expiresAt: Date;

  @Column({ type: DataType.INTEGER, allowNull: true })
  maxUses: number;

  @Column({ type: DataType.INTEGER, defaultValue: 0 })
  useCount: number;

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
