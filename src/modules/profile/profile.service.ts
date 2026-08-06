import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from '../../database/models/user.model';
import { UserProfile } from '../../database/models/user-profile.model';
import { UsersService } from '../users/users.service';
import { StorageService } from '../../common/storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Profile management: editable fields on `users` plus the optional signature
 * image stored on `user_profiles.defaultSignatureUrl`.
 *
 * Signature source is auto-detected in one handler:
 *  - multipart/form-data  → `req.file` (file picker)
 *  - application/json     → `dto.signature` (canvas.toDataURL base64)
 * Both funnel into the same buffer → storage pipeline.
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(UserProfile) private readonly profileModel: typeof UserProfile,
    @InjectModel(User) private readonly userModel: typeof User,
  ) {}

  /**
   * Updates profile fields and optionally a signature image in ONE transaction:
   * 1. store the new image to disk (if provided),
   * 2. update `users` profile fields (name/email/phone),
   * 3. update `user_profiles.defaultSignatureUrl` (upsert if no row yet),
   * 4. delete the previous signature file from disk.
   *
   * The old file is removed only AFTER the new file + DB writes succeeded.
   *
   * @param file   Multipart uploaded file (file-picker path).
   * @param dto    Body fields (JSON path via `dto.signature`, plus profile fields).
   */
  async updateProfile(
    userId: string,
    file?: Express.Multer.File,
    dto?: UpdateProfileDto,
  ) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    // ---- resolve the signature source (file vs base64) into one buffer ----
    let newSignature: { mimeType: string; buffer: Buffer } | undefined;

    if (file) {
      newSignature = { mimeType: file.mimetype, buffer: file.buffer };
    } else if (dto?.signature) {
      const { mimeType, base64Content } = this.storageService.decodeDataUrl(dto.signature);
      newSignature = { mimeType, buffer: Buffer.from(base64Content, 'base64') };
    }

    // Validate MIME + size early (throws BadRequestException).
    let stored: { fileName: string; mimeType: string } | undefined;
    if (newSignature) {
      stored = await this.storageService.store(
        'signatures',
        newSignature.buffer,
        newSignature.mimeType,
        SIGNATURE_MAX_BYTES,
      );
    }

    try {
      return await this.sequelize.transaction(async (tx) => {
        // 1. profile fields on `users`
        const updates = {
          name: dto?.name,
          email: dto?.email,
          phone: dto?.phone,
        };
        if (updates.name || updates.email || updates.phone) {
          await this.usersService.updateProfileFields(
            userId,
            Object.fromEntries(
              Object.entries(updates).filter(([, v]) => v !== undefined),
            ) as Partial<Pick<User, 'name' | 'email' | 'phone'>>,
            { transaction: tx },
          );
        }

        // 2. user_profiles row (jobTitle + signature URL), upsert if missing
        const profile = await this.profileModel.findOne({
          where: { userId },
          transaction: tx,
        });

        const prevSignatureUrl = profile?.defaultSignatureUrl ?? null;
        const profileUpdates: Partial<Record<string, unknown>> = {};

        if (dto?.jobTitle !== undefined) {
          profileUpdates.jobTitle = dto.jobTitle;
        }
        if (stored) {
          profileUpdates.defaultSignatureUrl = stored.fileName;
          profileUpdates.signatureUpdatedAt = new Date();
        }

        if (Object.keys(profileUpdates).length > 0) {
          if (profile) {
            await profile.update(profileUpdates, { transaction: tx });
          } else {
            await this.profileModel.create(
              {
                userId,
                organizationId: user.organizationId,
                ...profileUpdates,
              },
              { transaction: tx },
            );
          }
        }

        // 3. delete previous file only after everything above succeeded
        if (stored && prevSignatureUrl) {
          await this.storageService.remove('signatures', prevSignatureUrl).catch((e) => {
            this.logger.warn(`Gagal menghapus signature lama: ${e.message}`);
          });
        }

        return this.userProfilePayload(userId, tx);
      });
    } catch (err) {
      // DB failed → don't leave the new file orphaned on disk.
      if (stored) {
        await this.storageService
          .remove('signatures', stored.fileName)
          .catch(() => undefined);
      }
      throw err;
    }
  }

  /** Public signature URL path (not a filesystem path). */
  signatureUrlFor(fileName: string): string {
    return this.storageService.relativePath('signatures', fileName);
  }

  /** Reads the signature file bytes for the owning user (auth enforced at controller). */
  async readSignature(userId: string): Promise<{ data: Buffer; mimeType: string }> {
    const profile = await this.profileModel.findOne({ where: { userId } });
    if (!profile?.defaultSignatureUrl) {
      throw new NotFoundException('Signature belum tersedia');
    }
    const data = this.storageService.readSync('signatures', profile.defaultSignatureUrl);
    const mimeType = this.storageService.mimeTypeOf(
      this.storageService.resolvePath('signatures', profile.defaultSignatureUrl),
    );
    return { data, mimeType };
  }

  /** Read-only profile payload (no transaction needed). */
  async getProfile(userId: string) {
    const user = await this.userModel.findByPk(userId);
    const profile = await this.profileModel.findOne({ where: { userId } });

    return {
      user: user ? user.toSafeObject() : null,
      signatureUrl: profile?.defaultSignatureUrl
        ? this.storageService.relativePath('signatures', profile.defaultSignatureUrl)
        : null,
      profile: profile ? profile.toJSON() : null,
    };
  }

  private async userProfilePayload(
    userId: string,
    tx: any,
  ): Promise<{ user: Record<string, unknown> | null; signatureUrl: string | null; profile?: Record<string, unknown> | null }> {
    const user = await this.userModel.findByPk(userId, { transaction: tx });
    const profile = await this.profileModel.findOne({ where: { userId }, transaction: tx });

    return {
      user: user ? user.toSafeObject() : null,
      signatureUrl: profile?.defaultSignatureUrl
        ? this.storageService.relativePath('signatures', profile.defaultSignatureUrl)
        : null,
      profile: profile ? profile.toJSON() : null,
    };
  }
}
