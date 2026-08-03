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
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { Organization } from './organization.model';
import { Role } from './role.model';
import { SubconCompany } from './subcon-company.model';

@Table({ tableName: 'users', underscored: true, timestamps: true })
export class User extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @BelongsTo(() => Organization, 'organizationId')
  organization: Organization;

  // NULL for Main-Con users (Supervisor Main-Con, HSE, CM, Org Admin, Super Admin).
  @ForeignKey(() => SubconCompany)
  @Column({ type: DataType.UUID, allowNull: true })
  subconCompanyId: string;

  @BelongsTo(() => SubconCompany, 'subconCompanyId')
  subconCompany: SubconCompany;

  @ForeignKey(() => Role)
  @Column({ type: DataType.UUID, allowNull: false })
  roleId: string;

  @BelongsTo(() => Role, 'roleId')
  role: Role;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name: string;

  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  email: string;

  @Column({ type: DataType.STRING(30), allowNull: true })
  phone: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  passwordHash: string;

  @Column({
    type: DataType.ENUM(...Object.values(VerificationStatus)),
    defaultValue: VerificationStatus.PENDING,
  })
  verificationStatus: VerificationStatus;

  @Column({ type: DataType.UUID, allowNull: true })
  verifiedBy: string;

  @Column({ type: DataType.DATE, allowNull: true })
  verifiedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  lastLoginAt: Date;

  @Column({
    type: DataType.ENUM(...Object.values(RecordStatus)),
    defaultValue: RecordStatus.ACTIVE,
  })
  status: RecordStatus;

  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string;

  /**
   * Strips sensitive fields before sending the model out over HTTP.
   * Use this instead of returning the raw model/toJSON() from controllers.
   */
  toSafeObject(): Record<string, unknown> {
    const { passwordHash, ...safe } = this.toJSON();
    return safe;
  }
}
