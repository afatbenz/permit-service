import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { Organization } from './organization.model';
import { User } from './user.model';

@Table({ tableName: 'user_profiles', underscored: true, timestamps: true })
export class UserProfile extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  userId: string;

  @Column({ type: DataType.STRING(150), allowNull: true })
  jobTitle: string;

  @Column({ type: DataType.STRING(500), allowNull: true })
  avatarUrl: string;

  // Reusable signature used at PDF export time. permit_approvals should
  // store a *snapshot* of this URL at the moment of approval, not a live
  // reference — see design doc section 3 ("Digital Signature").
  @Column({ type: DataType.STRING(500), allowNull: true })
  defaultSignatureUrl: string;

  @Column({ type: DataType.DATE, allowNull: true })
  signatureUpdatedAt: Date;

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
