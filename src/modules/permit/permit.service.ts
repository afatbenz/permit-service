import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PermitEvidence } from '../../database/models/permit-evidence.model';
import { StorageService } from '../../common/storage/storage.service';
import { EvidenceType } from '../../common/enums/evidence-type.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { RoleCode } from '../../common/enums/role-code.enum';

const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file

/**
 * Evidence uploads for permits. All files for a single request are written
 * to disk AND inserted as rows inside one flow; if any file fails
 * validation or any DB insert fails, previously written files are rolled
 * back (deleted) so no orphaned file survives without its row.
 */
@Injectable()
export class PermitService {
  private readonly logger = new Logger(PermitService.name);

  constructor(
    @InjectModel(PermitEvidence) private readonly evidenceModel: typeof PermitEvidence,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Uploads many evidence files for a permit in one request.
   *
   * @param permitId  Opaque permit reference.
   * @param files     Multer-parsed file array (each has buffer, mimetype, size).
   * @param types     EvidenceType per file, index-aligned with `files`.
   */
  async uploadEvidence(
    permitId: string,
    files: Express.Multer.File[],
    types: EvidenceType[],
    user: AuthenticatedUser,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('Tidak ada file yang diupload.');
    }
    if (types.length !== files.length) {
      throw new BadRequestException(
        `Jumlah types (${types.length}) tidak sama dengan jumlah files (${files.length}).`,
      );
    }

    // Track written files so we can roll back on any failure (all-or-nothing).
    const written: Array<{ fileName: string; mimeType: string; sizeBytes: number }> = [];

    try {
      const rows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const evidenceType = types[i];

        // Validate MIME + size, then write to storage/evidence/.
        const stored = await this.storageService.store(
          'evidence',
          file.buffer,
          file.mimetype,
          EVIDENCE_MAX_BYTES,
        );
        written.push({ fileName: stored.fileName, mimeType: stored.mimeType, sizeBytes: stored.sizeBytes });

        rows.push({
          permitId,
          organizationId: user.organizationId,
          evidenceType,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          uploadedBy: user.id,
        });
      }

      // Insert all rows; if this throws, the catch below cleans up files.
      const created = await this.evidenceModel.bulkCreate(rows);

      return {
        message: `${created.length} evidence berhasil diupload.`,
        evidences: created.map((e) => this.toEvidencePayload(e)),
      };
    } catch (err) {
      // Roll back any files written so far — no orphaned files without a row.
      for (const w of written) {
        await this.storageService.remove('evidence', w.fileName).catch(() => undefined);
      }
      throw err;
    }
  }

  /**
   * Lists evidence for a permit, optionally filtered by EvidenceType.
   * Scoped to the caller's organization.
   */
  async listEvidence(permitId: string, evidenceType: EvidenceType | undefined, user: AuthenticatedUser) {
    const where: Record<string, unknown> = {
      permitId,
      organizationId: user.organizationId,
    };
    if (evidenceType) {
      where.evidenceType = evidenceType;
    }

    const rows = await this.evidenceModel.findAll({
      where,
      order: [['createdAt', 'ASC']],
    });

    return { evidences: rows.map((e) => this.toEvidencePayload(e)) };
  }

  /** Reads a single evidence file for streaming; ownership by org scope. */
  async readEvidence(
    permitId: string,
    evidenceId: string,
    user: AuthenticatedUser,
  ): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
    const evidence = await this.assertEvidenceAccess(permitId, evidenceId, user);
    const data = this.storageService.readSync('evidence', evidence.fileName);
    const mimeType = this.storageService.mimeTypeOf(
      this.storageService.resolvePath('evidence', evidence.fileName),
    );
    return { data, mimeType, fileName: evidence.fileName };
  }

  /** Deletes one evidence: DB row + physical file (idempotent). */
  async deleteEvidence(permitId: string, evidenceId: string, user: AuthenticatedUser) {
    const evidence = await this.assertEvidenceAccess(permitId, evidenceId, user);

    // Remove file first; DB row last. If row delete fails the file is gone
    // but that's recoverable via re-upload — the reverse would leave an
    // orphaned file, which is worse.
    await this.storageService.remove('evidence', evidence.fileName);
    await this.evidenceModel.destroy({ where: { id: evidence.id } });

    return { message: 'Evidence dihapus.', id: evidence.id };
  }

  /** Loads an evidence row and enforces org scope (or Super Admin). */
  private async assertEvidenceAccess(
    permitId: string,
    evidenceId: string,
    user: AuthenticatedUser,
  ): Promise<PermitEvidence> {
    const evidence = await this.evidenceModel.findByPk(evidenceId);
    if (!evidence || evidence.permitId !== permitId) {
      throw new NotFoundException('Evidence tidak ditemukan.');
    }
    if (evidence.organizationId !== user.organizationId && user.roleCode !== RoleCode.SUPER_ADMIN) {
      throw new ForbiddenException('Tidak bisa mengakses evidence organization lain.');
    }
    return evidence;
  }

  private toEvidencePayload(e: PermitEvidence) {
    return {
      id: e.id,
      permitId: e.permitId,
      evidenceType: e.evidenceType,
      mimeType: e.mimeType,
      sizeBytes: e.sizeBytes,
      uploadedBy: e.uploadedBy,
      url: `/api/v1/permits/${e.permitId}/evidences/${e.id}/file`,
      createdAt: e.createdAt,
    };
  }
}
