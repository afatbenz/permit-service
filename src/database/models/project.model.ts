import { Column, DataType, Default, ForeignKey, Model, PrimaryKey, Table } from 'sequelize-typescript';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { Organization } from './organization.model';

@Table({ tableName: 'projects', underscored: true, timestamps: true })
export class Project extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => Organization)
  @Column({ type: DataType.UUID, allowNull: false })
  organizationId: string;

  @Column({ type: DataType.STRING(50), allowNull: false })
  projectCode: string;

  @Column({ type: DataType.STRING(255), allowNull: false })
  name: string;

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
