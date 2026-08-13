import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { PermitCategory } from '../../database/models/permit-category.model';
import { Project } from '../../database/models/project.model';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateProjectCategoryDto } from './dto/create-project-category.dto';
import { UpdateProjectCategoryDto } from './dto/update-project-category.dto';

type CategoryScope = 'system' | 'organization' | 'project';

/**
 * Permit-category catalog for one project. Rows are resolved by NAME
 * precedence (most specific wins): project > organization > system.
 * Mutations are only allowed by super_admin, the project's org_admin, or
 * the project's project_admin. Reads are allowed for any authenticated user
 * (the new-permit form needs the dropdown).
 *
 * Project-scoped rows double as tombstones: removing a default inserts an
 * 'archived' project row of the same name, so it stays hidden for this
 * project only. Re-adding reactivates that row (stable id).
 */
@Injectable()
export class ProjectCategoryService {
  constructor(
    @InjectModel(PermitCategory)
    private readonly categoryModel: typeof PermitCategory,
    @InjectModel(Project)
    private readonly projectModel: typeof Project,
  ) {}

  /** Loads the project or throws; also proves org scope when orgId given. */
  private async loadProject(projectId: string, organizationId?: string): Promise<Project> {
    const where: Record<string, unknown> = { id: projectId };
    if (organizationId) where.organizationId = organizationId;
    const project = await this.projectModel.findOne({ where });
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan');
    }
    return project;
  }

  /** Scope check for mutations: super / org_admin of the project's org / its project_admin. */
  private assertCanMutate(project: Project, actor: AuthenticatedUser): void {
    const isSuper = actor.roleCode === RoleCode.SUPER_ADMIN;
    const isOrgAdmin =
      actor.roleCode === RoleCode.ORG_ADMIN && actor.organizationId === project.organizationId;
    const isProjAdmin =
      actor.roleCode === RoleCode.PROJECT_ADMIN && project.projectAdminId === actor.id;
    if (!isSuper && !isOrgAdmin && !isProjAdmin) {
      throw new ForbiddenException('Anda tidak berwenang mengubah kategori proyek ini');
    }
  }

  /**
   * Effective category list for a project, resolved across all three scopes.
   * Archived project rows (tombstones) hide a name; active project rows win.
   */
  async resolve(projectId: string, organizationId: string, actor: AuthenticatedUser) {
    const project = await this.loadProject(projectId, organizationId);
    const [systemRows, orgRows, projectRows] = await Promise.all([
      this.categoryModel.findAll({
        where: { organizationId: null, projectId: null },
        order: [['sortOrder', 'ASC']],
      }),
      this.categoryModel.findAll({
        where: { organizationId, projectId: null },
      }),
      this.categoryModel.findAll({
        where: { organizationId, projectId },
      }),
    ]);

    const byName = new Map<string, PermitCategory>();
    for (const row of systemRows) byName.set(row.name, row);
    for (const row of orgRows) {
      if (row.status === RecordStatus.ACTIVE) byName.set(row.name, row);
    }
    for (const row of projectRows) {
      if (row.status === RecordStatus.ACTIVE) byName.set(row.name, row);
    }
    // Archived project rows are tombstones: remove the name entirely.
    for (const row of projectRows) {
      if (row.status === RecordStatus.ARCHIVED) byName.delete(row.name);
    }

    const canMutate =
      actor.roleCode === RoleCode.SUPER_ADMIN ||
      (actor.roleCode === RoleCode.ORG_ADMIN && actor.organizationId === project.organizationId) ||
      (actor.roleCode === RoleCode.PROJECT_ADMIN && project.projectAdminId === actor.id);

    const categories = [...byName.values()].map((row) => {
      const scope: CategoryScope = row.projectId
        ? 'project'
        : row.organizationId
          ? 'organization'
          : 'system';
      return {
        id: row.id,
        name: row.name,
        color: row.color,
        sortOrder: row.sortOrder,
        scope,
        isDefault: row.isDefault,
        removable: canMutate,
      };
    });

    return { categories };
  }

  /** Adds a category to the project, or recolors a default with the same name. */
  async create(
    projectId: string,
    dto: CreateProjectCategoryDto,
    organizationId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.loadProject(projectId, organizationId);
    this.assertCanMutate(project, actor);

    const name = dto.name.trim();
    const existing = await this.categoryModel.findOne({
      where: { organizationId, projectId, name },
    });
    if (existing) {
      if (existing.status === RecordStatus.ARCHIVED) {
        // Re-add a removed default — reactivate the tombstone (stable id).
        await existing.update({ status: RecordStatus.ACTIVE, color: dto.color, updatedBy: actor.id });
        return { category: existing.toJSON() };
      }
      if (existing.status === RecordStatus.ACTIVE) {
        // Same name, same scope → treat as a recolor.
        await existing.update({ color: dto.color, updatedBy: actor.id });
        return { category: existing.toJSON() };
      }
      throw new ConflictException('Kategori sudah tidak aktif di proyek ini');
    }

    // Collide with a system/org-level name? No — per-project rows always
    // win by precedence, so overriding a default's color is just inserting.
    const created = await this.categoryModel.create({
      organizationId,
      projectId,
      name,
      color: dto.color,
      isSystem: false,
      isDefault: false,
      sortOrder: 0,
      status: RecordStatus.ACTIVE,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    return { category: created.toJSON() };
  }

  /** Recolors a category for this project (project-scoped override row). */
  async updateColor(
    projectId: string,
    categoryId: string,
    dto: UpdateProjectCategoryDto,
    organizationId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.loadProject(projectId, organizationId);
    this.assertCanMutate(project, actor);

    const existing = await this.categoryModel.findOne({
      where: { id: categoryId, organizationId, projectId },
    });
    if (!existing) {
      throw new NotFoundException('Kategori tidak ditemukan di proyek ini');
    }
    await existing.update({ color: dto.color, updatedBy: actor.id });
    return { category: existing.toJSON() };
  }

  /** Hides a category for this project (archives project row / inserts tombstone). */
  async remove(
    projectId: string,
    categoryId: string,
    organizationId: string,
    actor: AuthenticatedUser,
  ) {
    const project = await this.loadProject(projectId, organizationId);
    this.assertCanMutate(project, actor);

    const existing = await this.categoryModel.findOne({
      where: { id: categoryId, organizationId, projectId },
    });
    if (existing) {
      await existing.update({ status: RecordStatus.ARCHIVED, updatedBy: actor.id });
      return { message: 'Kategori dihapus dari proyek ini', categoryId };
    }

    // Not a project-scoped row (a system default). Tombstone it so it stays
    // hidden for THIS project only.
    const source = await this.categoryModel.findOne({ where: { id: categoryId } });
    if (!source) {
      throw new NotFoundException('Kategori tidak ditemukan');
    }
    await this.categoryModel.create({
      organizationId,
      projectId,
      name: source.name,
      color: source.color,
      isSystem: false,
      isDefault: source.isDefault,
      sortOrder: source.sortOrder,
      status: RecordStatus.ARCHIVED,
      createdBy: actor.id,
      updatedBy: actor.id,
    });
    return { message: 'Kategori dihapus dari proyek ini', categoryId };
  }
}
