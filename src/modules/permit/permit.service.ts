import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Permit } from '../../database/models/permit.model';
import { PermitAnswer } from '../../database/models/permit-answer.model';
import { PermitBankQuestion } from '../../database/models/permit-bank-question.model';
import { PermitEvidence } from '../../database/models/permit-evidence.model';
import { PermitCategory } from '../../database/models/permit-category.model';
import { Project } from '../../database/models/project.model';
import { Role } from '../../database/models/role.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';
import { StorageService } from '../../common/storage/storage.service';
import { EvidenceType } from '../../common/enums/evidence-type.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { RoleCode } from '../../common/enums/role-code.enum';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { PermitStatus } from '../../common/enums/permit-status.enum';
import { CreatePermitDto } from './dto/create-permit.dto';
import { UpdatePermitDto } from './dto/update-permit.dto';
import { UpdatePermitStatusDto } from './dto/update-permit-status.dto';

const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file

/**
 * Permit-to-work records + evidence attachments.
 *
 * Each permit belongs to one project (and its org).
 * Access rules:
 *  - super_admin / org_admin of the org: view + mutate every permit of the org.
 *  - members (supervisor_subcon etc.): view/create permits in the projects
 *    they hold an ACTIVE assignment for. Approval/rejection is admin-only.
 *
 * A member is recognized by their ACTIVE assignment's per-project role, not
 * their global role (same pattern as updateProjectUserRole / bank questions).
 * Permit number is generated `PMT-<year>-<seq>` per org.
 */
@Injectable()
export class PermitService {
  private readonly logger = new Logger(PermitService.name);

  constructor(
    @InjectModel(Permit) private readonly permitModel: typeof Permit,
    @InjectModel(PermitAnswer) private readonly answerModel: typeof PermitAnswer,
    @InjectModel(PermitBankQuestion)
    private readonly questionModel: typeof PermitBankQuestion,
    @InjectModel(PermitEvidence) private readonly evidenceModel: typeof PermitEvidence,
    @InjectModel(Project) private readonly projectModel: typeof Project,
    @InjectModel(UserProjectAssignment)
    private readonly assignmentModel: typeof UserProjectAssignment,
    private readonly storageService: StorageService,
  ) {}

  // ---------------------------------------------------------------------
  //  Permit CRUD
  // ---------------------------------------------------------------------

  /** Loads a project of the caller's org (or any org for super_admin). */
  private async loadProject(projectId: string, organizationId: string, actor: AuthenticatedUser) {
    const where: Record<string, unknown> = { id: projectId };
    if (actor.roleCode !== RoleCode.SUPER_ADMIN) where.organizationId = organizationId;
    const project = await this.projectModel.findOne({ where });
    if (!project) throw new NotFoundException('Proyek tidak ditemukan');
    return project;
  }

  /** True if the caller is super_admin or org_admin of the project's org. */
  private isOrgAdmin(project: Project, actor: AuthenticatedUser): boolean {
    return (
      actor.roleCode === RoleCode.SUPER_ADMIN ||
      (actor.roleCode === RoleCode.ORG_ADMIN && actor.organizationId === project.organizationId)
    );
  }

  /** True if the caller holds an ACTIVE assignment to this project. */
  private async isAssignedToProject(project: Project, actor: AuthenticatedUser): Promise<boolean> {
    const assignment = await this.assignmentModel.findOne({
      where: { userId: actor.id, projectId: project.id, status: RecordStatus.ACTIVE },
      include: [{ model: Role, as: 'role', required: false }],
    });
    return !!assignment;
  }

  /** Projects the caller can access permits for (admin → all org projects; member → assigned). */
  private async accessibleProjectIds(actor: AuthenticatedUser, organizationId: string): Promise<string[] | null> {
    if (actor.roleCode === RoleCode.SUPER_ADMIN) return null; // all orgs
    if (actor.roleCode === RoleCode.ORG_ADMIN) {
      const rows = await this.projectModel.findAll({
        where: { organizationId, status: RecordStatus.ACTIVE },
        attributes: ['id'],
      });
      return rows.map((p) => p.id);
    }
    // Member — only projects they are assigned to.
    const assignments = await this.assignmentModel.findAll({
      where: { userId: actor.id, organizationId, status: RecordStatus.ACTIVE },
      attributes: ['projectId'],
    });
    return assignments.map((a) => a.projectId);
  }

  /** Generates the next permit number for an org: PMT-<year>-<seq>. */
  private async nextPermitNumber(organizationId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PMT-${year}-`;
    const rows = await this.permitModel.findAll({
      where: { organizationId, permitNumber: { [Op.like]: `${prefix}%` } },
      attributes: ['permitNumber'],
    });
    let seq = rows.reduce((max, r) => {
      const n = parseInt(r.permitNumber.slice(prefix.length), 10);
      return Number.isNaN(n) ? max : Math.max(max, n);
    }, 0);
    seq += 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  /** Serializes a permit row: joined project fields + answers (list/flat view). */
  private toPermitPayload(p: Permit): Record<string, unknown> {
    const json = p.toJSON() as any;
    return {
      ...json,
      projectName: json.project?.name ?? null,
      projectCode: json.project?.projectCode ?? null,
      answers: (json.answers ?? []).map((a: any) => ({
        questionId: a.questionId,
        answer: a.answer,
      })),
    };
  }

  /**
   * Replaces the permit's answer set. When `questions` is provided the old
   * rows are deleted and the new ones inserted (permit_answers is a small
   * child set; UNIQUE(permit_id, question_id) guarantees no duplicates).
   */
  private async saveAnswers(permitId: string, questions: Array<{ questionId: string; answer: boolean }>) {
    if (!questions || questions.length === 0) return;
    const questionIds = questions.map((q) => q.questionId);
    const rows = await this.questionModel.findAll({
      where: { id: { [Op.in]: questionIds } },
      attributes: ['id', 'categoryId'],
    });
    const found = new Set(rows.map((r) => r.id));
    for (const q of questions) {
      if (!found.has(q.questionId)) {
        throw new BadRequestException('Salah satu pertanyaan tidak tersedia di bank pertanyaan proyek ini');
      }
    }
    await this.answerModel.destroy({ where: { permitId } });
    await this.answerModel.bulkCreate(
      questions.map((q) => ({ permitId, questionId: q.questionId, answer: q.answer })),
    );
  }

  /** Lists permits the caller can see, for a project (admin) or all their accessible projects (member). */
  async list(projectId: string | null, actor: AuthenticatedUser, organizationId: string) {
    const where: Record<string, unknown> = {};

    if (actor.roleCode === RoleCode.SUPER_ADMIN) {
      if (projectId) where.projectId = projectId;
    } else {
      where.organizationId = organizationId;
      if (projectId) {
        const project = await this.loadProject(projectId, organizationId, actor);
        const accessible = await this.accessibleProjectIds(actor, organizationId);
        if (accessible && !accessible.includes(project.id)) {
          throw new ForbiddenException('Anda tidak berwenang melihat permit proyek ini');
        }
        where.projectId = project.id;
      } else {
        const accessible = await this.accessibleProjectIds(actor, organizationId);
        if (accessible && accessible.length === 0) return { permits: [] };
        if (accessible) where.projectId = { [Op.in]: accessible };
      }
    }

    const permits = await this.permitModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: Project,
          as: 'project',
          attributes: ['id', 'name', 'projectCode'],
          required: false,
        },
        {
          model: PermitAnswer,
          as: 'answers',
          attributes: ['id', 'permitId', 'questionId', 'answer'],
          required: false,
        },
      ],
    });

    return {
      permits: permits.map((p) => this.toPermitPayload(p)),
    };
  }

  /** Creates a permit (draft) for a project the caller can write to. */
  async create(
    projectId: string,
    dto: CreatePermitDto,
    actor: AuthenticatedUser,
    organizationId: string,
  ) {
    const project = await this.loadProject(projectId, organizationId, actor);
    if (!this.isOrgAdmin(project, actor) && !(await this.isAssignedToProject(project, actor))) {
      throw new ForbiddenException('Anda tidak terhubung ke proyek ini');
    }

    const permitNumber = await this.nextPermitNumber(organizationId);
    const created = await this.permitModel.create({
      organizationId,
      projectId: project.id,
      permitNumber,
      workTitle: dto.workTitle.trim(),
      department: dto.department.trim(),
      contractorName: dto.contractorName.trim(),
      location1: dto.location1.trim(),
      location2: dto.location2?.trim() ?? null,
      city: dto.city.trim(),
      province: dto.province.trim(),
      startAt: dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt ? new Date(dto.endAt) : null,
      workDesc: dto.workDesc ?? null,
      categoryId: dto.categoryId ?? null,
      status: PermitStatus.DRAFT,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    if (dto.questions?.length) {
      await this.saveAnswers(created.id, dto.questions);
    }
    return { permit: created.toJSON() };
  }

  /** Fetches one permit the caller can see (includes answer question text + category). */
  async findOne(permitId: string, actor: AuthenticatedUser, organizationId: string) {
    const permit = await this.permitModel.findByPk(permitId, {
      include: [
        {
          model: PermitAnswer,
          as: 'answers',
          include: [
            {
              model: PermitBankQuestion,
              as: 'question',
              attributes: ['id', 'questionEn', 'categoryId'],
              required: false,
            },
          ],
          required: false,
        },
        {
          model: PermitCategory,
          as: 'category',
          attributes: ['id', 'name', 'color'],
          required: false,
        },
      ],
    });
    if (!permit) throw new NotFoundException('Permit tidak ditemukan');

    if (actor.roleCode === RoleCode.SUPER_ADMIN) {
      // allowed
    } else if (permit.organizationId !== organizationId) {
      throw new NotFoundException('Permit tidak ditemukan');
    } else if (actor.roleCode !== RoleCode.ORG_ADMIN) {
      const accessible = await this.accessibleProjectIds(actor, organizationId);
      if (!accessible || !accessible.includes(permit.projectId)) {
        throw new ForbiddenException('Anda tidak berwenang melihat permit ini');
      }
    }

    const json = permit.toJSON() as any;
    return {
      permit: {
        ...json,
        categoryName: json.category?.name ?? null,
        answers: (json.answers ?? []).map((a: any) => ({
          questionId: a.questionId,
          answer: a.answer,
          questionEn: a.question?.questionEn ?? null,
          categoryId: a.question?.categoryId ?? null,
        })),
      },
    };
  }

  /** Updates a permit's work-activity fields. Only draft permits can be edited. */
  async update(
    permitId: string,
    dto: UpdatePermitDto,
    actor: AuthenticatedUser,
    organizationId: string,
  ) {
    const { permit } = await this.findOne(permitId, actor, organizationId);
    if (permit.status !== PermitStatus.DRAFT) {
      throw new BadRequestException('Hanya permit berstatus draft yang bisa diubah');
    }

    const patch: Record<string, unknown> = { updatedBy: actor.id };
    if (dto.categoryId !== undefined) patch.categoryId = dto.categoryId;
    if (dto.workTitle !== undefined) patch.workTitle = dto.workTitle.trim();
    if (dto.department !== undefined) patch.department = dto.department.trim();
    if (dto.contractorName !== undefined) patch.contractorName = dto.contractorName.trim();
    if (dto.location1 !== undefined) patch.location1 = dto.location1.trim();
    if (dto.location2 !== undefined) patch.location2 = dto.location2.trim() || null;
    if (dto.city !== undefined) patch.city = dto.city.trim();
    if (dto.province !== undefined) patch.province = dto.province.trim();
    if (dto.startAt !== undefined) patch.startAt = dto.startAt ? new Date(dto.startAt) : null;
    if (dto.endAt !== undefined) patch.endAt = dto.endAt ? new Date(dto.endAt) : null;
    if (dto.workDesc !== undefined) patch.workDesc = dto.workDesc ?? null;

    await this.permitModel.update(patch, { where: { id: permitId } });
    if (dto.questions) {
      await this.saveAnswers(permitId, dto.questions);
    }
    const { permit: updated } = await this.findOne(permitId, actor, organizationId);
    return { permit: updated };
  }

  /** Advances the permit workflow. Approval/rejection is admin-only. */
  async updateStatus(
    permitId: string,
    dto: UpdatePermitStatusDto,
    actor: AuthenticatedUser,
    organizationId: string,
  ) {
    const permit = await this.permitModel.findByPk(permitId);
    if (!permit) throw new NotFoundException('Permit tidak ditemukan');
    if (permit.organizationId !== organizationId && actor.roleCode !== RoleCode.SUPER_ADMIN) {
      throw new NotFoundException('Permit tidak ditemukan');
    }

    if (dto.status === PermitStatus.APPROVED || dto.status === PermitStatus.REJECTED) {
      const project = await this.loadProject(permit.projectId, organizationId, actor);
      if (!this.isOrgAdmin(project, actor)) {
        throw new ForbiddenException('Hanya admin proyek/organisasi yang bisa menyetujui/menolak permit');
      }
    }

    if (dto.status === PermitStatus.REJECTED && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('Alasan penolakan wajib diisi');
    }
    if (permit.status === PermitStatus.APPROVED || permit.status === PermitStatus.REJECTED) {
      throw new BadRequestException('Permit yang sudah selesai tidak bisa diubah statusnya');
    }

    const now = new Date();
    const patch: Record<string, unknown> = { status: dto.status, updatedBy: actor.id };
    if (dto.status === PermitStatus.SUBMITTED) patch.submittedAt = now;
    if (dto.status === PermitStatus.APPROVED) {
      patch.approvedAt = now;
      patch.approvedBy = actor.id;
    }
    if (dto.status === PermitStatus.REJECTED) {
      patch.rejectedAt = now;
      patch.rejectedBy = actor.id;
      patch.rejectionReason = dto.rejectionReason!.trim();
    }

    await this.permitModel.update(patch, { where: { id: permitId } });
    const { permit: updated } = await this.findOne(permitId, actor, organizationId);
    return { permit: updated };
  }

  /** Deletes a permit (hard delete) + its evidence + answers. Admin-only; only non-approved/rejected permits can be removed. */
  async remove(permitId: string, actor: AuthenticatedUser, organizationId: string) {
    const permit = await this.permitModel.findByPk(permitId);
    if (!permit) throw new NotFoundException('Permit tidak ditemukan');
    if (permit.organizationId !== organizationId && actor.roleCode !== RoleCode.SUPER_ADMIN) {
      throw new NotFoundException('Permit tidak ditemukan');
    }
    const project = await this.loadProject(permit.projectId, organizationId, actor);
    if (!this.isOrgAdmin(project, actor)) {
      throw new ForbiddenException('Hanya admin proyek/organisasi yang bisa menghapus permit');
    }
    if (permit.status === PermitStatus.APPROVED || permit.status === PermitStatus.REJECTED) {
      throw new BadRequestException('Permit yang sudah selesai tidak bisa dihapus');
    }
    await this.evidenceModel.destroy({ where: { permitId } });
    await this.answerModel.destroy({ where: { permitId } });
    await this.permitModel.destroy({ where: { id: permitId } });
    return { message: 'Permit dihapus', permitId };
  }

  // ---------------------------------------------------------------------
  //  Evidence (attachments)
  // ---------------------------------------------------------------------

  /**
   * Uploads many evidence files for a permit in one request.
   *
   * @param permitId  Permit reference.
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
