import { Column, DataType, Default, HasMany, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { User } from './user.model';

@Table({ tableName: 'organizations', underscored: true, timestamps: true })
export class Organization extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name: string;

  @Column({ type: DataType.STRING(50), allowNull: false, unique: true })
  code: string;

  @Column({
    type: DataType.ENUM(...Object.values(RecordStatus)),
    defaultValue: RecordStatus.ACTIVE,
  })
  status: RecordStatus;

  // Audit-only reference to the user who created/updated this row.
  // Intentionally left as a plain UUID column (no @ForeignKey/@BelongsTo)
  // to avoid a hard circular association with User — the FK constraint
  // itself already exists at the DB level (see ddl_auth_organization.sql).
  @Column({ type: DataType.UUID, allowNull: true })
  createdBy: string;

  @Column({ type: DataType.UUID, allowNull: true })
  updatedBy: string;

  @HasMany(() => User, { foreignKey: 'organizationId' })
  users: User[];
}
