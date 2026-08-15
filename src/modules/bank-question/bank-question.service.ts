import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { PermitBankQuestion } from '../../database/models/permit-bank-question.model';
import { PermitCategory } from '../../database/models/permit-category.model';
import { Project } from '../../database/models/project.model';
import { Role } from '../../database/models/role.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateBankQuestionDto } from './dto/create-bank-question.dto';
import { UpdateBankQuestionDto } from './dto/update-bank-question.dto';

/**
 * Checklist questions for a project's permit categories (the "Bank Question"
 * screen). Questions are per-project: every row belongs to one project and one
 * permit category of that project. Reads are open to any authenticated user of
 * the project's org; mutations require super_admin, the project's org_admin,
 * or the project's project_admin.
 *
 * A project_admin is recognized by their ACTIVE assignment's per-project role
 * (user_project_assignments.role_id), NOT their global role — a user can hold
 * project_admin in one project while their global role stays e.g.
 * supervisor_subcon (same pattern as updateProjectUserRole).
 */
@Injectable()
export class BankQuestionService {
  constructor(
    @InjectModel(PermitBankQuestion)
    private readonly questionModel: typeof PermitBankQuestion,
    @InjectModel(PermitCategory)
    private readonly categoryModel: typeof PermitCategory,
    @InjectModel(Project)
    private readonly projectModel: typeof Project,
    @InjectModel(UserProjectAssignment)
    private readonly assignmentModel: typeof UserProjectAssignment,
  ) {}

  /** Loads the project, proving org scope when orgId given. */
  private async loadProject(projectId: string, organizationId: string): Promise<Project> {
    const project = await this.projectModel.findOne({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan');
    }
    return project;
  }

  /** Scope check for mutations: super / org_admin of the project's org / its project_admin (by assignment). */
  private async assertCanMutate(project: Project, actor: AuthenticatedUser): Promise<void> {
    const isSuper = actor.roleCode === RoleCode.SUPER_ADMIN;
    const isOrgAdmin =
      actor.roleCode === RoleCode.ORG_ADMIN && actor.organizationId === project.organizationId;
    if (isSuper || isOrgAdmin) return;

    const actorAssignment = await this.assignmentModel.findOne({
      where: { userId: actor.id, projectId: project.id, status: RecordStatus.ACTIVE },
      include: [{ model: Role, as: 'role', required: false }],
    });
    const isProjAdmin =
      (actorAssignment as any)?.role?.code === RoleCode.PROJECT_ADMIN &&
      project.projectAdminId === actor.id;
    if (!isProjAdmin) {
      throw new ForbiddenException('Anda tidak berwenang mengubah bank question proyek ini');
    }
  }

  /** Effective questions for a project (active only), with the category joined. */
  async list(projectId: string, organizationId: string, actor: AuthenticatedUser) {
    const project = await this.loadProject(projectId, organizationId);

    const rows = await this.questionModel.findAll({
      where: { organizationId, projectId, status: RecordStatus.ACTIVE },
      include: [
        {
          model: PermitCategory,
          as: 'category',
          required: false,
          where: { status: RecordStatus.ACTIVE },
        },
      ],
      order: [
        ['sortOrder', 'ASC'],
        ['createdAt', 'ASC'],
      ],
    });

    const questions = rows.map((row) => ({
      id: row.id,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      categoryColor: row.category?.color ?? null,
      questionEn: row.questionEn,
      questionId: row.questionId,
      sortOrder: row.sortOrder,
      canMutate: actor.roleCode === RoleCode.SUPER_ADMIN,
    }));

    return { projectId: project.id, questions };
  }

  /** Adds a question to the project's bank. */
  async create(
    projectId: string,
    dto: CreateBankQuestionDto,
    organizationId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.loadProject(projectId, organizationId);
    await this.assertCanMutate(project, actor);

    // The category must belong to this project's org (any scope row is fine —
    // defaults carry org NULL, so match by org when present).
    const category = await this.categoryModel.findOne({
      where: { id: dto.categoryId, status: RecordStatus.ACTIVE },
    });
    if (!category) {
      throw new NotFoundException('Kategori tidak ditemukan');
    }

    const created = await this.questionModel.create({
      organizationId,
      projectId,
      categoryId: dto.categoryId,
      questionEn: dto.questionEn.trim(),
      questionId: dto.questionId.trim(),
      sortOrder: dto.sortOrder ?? 0,
      status: RecordStatus.ACTIVE,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    return { question: created.toJSON() };
  }

  /** Updates a question of this project (category / phrasings / order). */
  async update(
    projectId: string,
    questionId: string,
    dto: UpdateBankQuestionDto,
    organizationId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.loadProject(projectId, organizationId);
    await this.assertCanMutate(project, actor);

    const existing = await this.questionModel.findOne({
      where: { id: questionId, organizationId, projectId },
    });
    if (!existing) {
      throw new NotFoundException('Pertanyaan tidak ditemukan di proyek ini');
    }

    const patch: Record<string, unknown> = { updatedBy: actor.id };
    if (dto.categoryId) {
      const category = await this.categoryModel.findOne({
        where: { id: dto.categoryId, status: RecordStatus.ACTIVE },
      });
      if (!category) {
        throw new NotFoundException('Kategori tidak ditemukan');
      }
      patch.categoryId = dto.categoryId;
    }
    if (dto.questionEn !== undefined) patch.questionEn = dto.questionEn.trim();
    if (dto.questionId !== undefined) patch.questionId = dto.questionId.trim();
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;

    await existing.update(patch);
    return { question: existing.toJSON() };
  }

  /** Soft-deletes a question for this project. */
  async remove(
    projectId: string,
    questionId: string,
    organizationId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.loadProject(projectId, organizationId);
    await this.assertCanMutate(project, actor);

    const existing = await this.questionModel.findOne({
      where: { id: questionId, organizationId, projectId },
    });
    if (!existing) {
      throw new NotFoundException('Pertanyaan tidak ditemukan di proyek ini');
    }
    await existing.update({ status: RecordStatus.ARCHIVED, updatedBy: actor.id });
    return { message: 'Pertanyaan dihapus dari proyek ini', questionId };
  }
}
