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
import { User } from './user.model';

/**
 * Server-side store for refresh tokens. Only the SHA-256 hash of the raw
 * token is persisted — the raw value is returned once at issue time and is
 * never written to disk. Rotated (old row deleted, new row created) on every
 * successful refresh, so a leaked refresh token can't be reused indefinitely.
 */
@Table({ tableName: 'refresh_tokens', underscored: true, timestamps: true })
export class RefreshToken extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  id: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  userId: string;

  @BelongsTo(() => User, 'userId')
  user: User;

  @Column({ type: DataType.STRING(255), allowNull: false, unique: true })
  tokenHash: string;

  @Column({ type: DataType.DATE, allowNull: false })
  expiresAt: Date;
}