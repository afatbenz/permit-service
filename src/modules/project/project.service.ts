import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { Project } from '../../database/models/project.model';
import { ProjectInvitationCode } from '../../database/models/project-invitation-code.model';
import { Role } from '../../database/models/role.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { RoleCode } from '../../common/enums/role-code.enum';
import { InvitationCodeStatus } from '../../common/enums/invitation-code-status.enum';
import { generateOrganizationCode } from '../../common/utils/organization-code.util';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const MAX_CODE_GENERATION_ATTEMPTS = 5;

@Injectable()
export class ProjectService {
  constructor(
    @InjectModel(Project) private readonly projectModel: typeof Project,
    @InjectModel(ProjectInvitationCode)
    private readonly invitationCodeModel: typeof ProjectInvitationCode,
    @InjectModel(UserProjectAssignment)
    private readonly assignmentModel: typeof UserProjectAssignment,
    @InjectModel(Role) private readonly roleModel: typeof Role,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  /**
   * All projects in the caller's organization, each with its active
   * invitation code so the UI can show a "copy code" action per project.
   */
  async listProjects(organizationId: string) {
    const projects = await this.projectModel.findAll({
      where: { organizationId },
      order: [['createdAt', 'DESC']],
    });
    const codes = await this.invitationCodeModel.findAll({
      where: { organizationId, status: InvitationCodeStatus.ACTIVE },
      attributes: ['projectId', 'code'],
    });
    const codeByProject = new Map(
      (codes as Array<{ projectId: string; code: string }>).map((c) => [c.projectId, c.code] as [string, string]),
    );
    return {
      projects: projects.map((p) => ({
        ...p.toJSON(),
        invitationCode: codeByProject.get(p.id) ?? null,
      })),
    };
  }

  /**
   * Projects the caller is actively assigned to. Open to any authenticated
   * user (spv_subcon needs it for the new-permit form's project dropdown).
   */
  async listMyProjects(userId: string, organizationId: string) {
    const assignments = await this.assignmentModel.findAll({
      where: { userId, organizationId, status: RecordStatus.ACTIVE },
      attributes: ['projectId', 'roleId'],
      include: [
        { model: Role, as: 'role', attributes: ['id', 'code', 'name'], required: false },
      ],
    });
    if (assignments.length === 0) return { projects: [] };
    const roleByProject = new Map(
      assignments.map((a) => [
        a.projectId,
        {
          roleId: a.roleId,
          roleCode: (a as any).role?.code ?? null,
          roleName: (a as any).role?.name ?? null,
        },
      ]),
    );
    const projectIds = assignments.map((a) => a.projectId);
    const projects = await this.projectModel.findAll({
      where: { id: { [Op.in]: projectIds }, status: RecordStatus.ACTIVE },
      order: [['name', 'ASC']],
    });
    return {
      projects: projects.map((p) => {
        const role = roleByProject.get(p.id);
        return { ...p.toJSON(), ...(role ?? { roleId: null, roleCode: null, roleName: null }) };
      }),
    };
  }

  /**
   * Creates a project (org-scoped, unique project_code) plus an invitation
   * code and an active membership row for the creating admin. The creator is
   * the project's first member → its project_admin (project_admin_id set).
   */
  async createProject(organizationId: string, dto: CreateProjectDto, createdBy: string) {
    const projectCode = dto.projectCode.toUpperCase();
    const existing = await this.projectModel.findOne({
      where: { organizationId, projectCode },
    });
    if (existing) {
      throw new ConflictException('Kode proyek sudah dipakai di organization ini');
    }
    const invitationCode = await this.generateUniqueInvitationCode(dto.name);

    // Creator is the project's first member → its project_admin.
    const projectAdminRole = await this.roleModel.findOne({
      where: { code: RoleCode.PROJECT_ADMIN },
    });
    if (!projectAdminRole) {
      throw new InternalServerErrorException('Role project_admin belum ter-seed di database');
    }

    const project = await this.sequelize.transaction(async (transaction) => {
      const created = await this.projectModel.create(
        {
          organizationId,
          projectCode,
          name: dto.name,
          projectAdminId: createdBy,
          status: RecordStatus.ACTIVE,
          createdBy,
        },
        { transaction },
      );

      await this.invitationCodeModel.create(
        {
          organizationId,
          projectId: created.id,
          code: invitationCode,
          status: InvitationCodeStatus.ACTIVE,
          createdBy,
        },
        { transaction },
      );

      await this.assignmentModel.create(
        {
          organizationId,
          userId: createdBy,
          projectId: created.id,
          roleId: projectAdminRole.id,
          status: RecordStatus.ACTIVE,
          createdBy,
        },
        { transaction },
      );

      return created;
    });

    return {
      project: project.toJSON(),
      invitationCode,
    };
  }

  async getProject(projectId: string, organizationId: string) {
    const project = await this.projectModel.findOne({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan');
    }
    return { project: project.toJSON() };
  }

  async updateProject(
    projectId: string,
    dto: UpdateProjectDto,
    organizationId: string,
    actorId: string,
  ) {
    const project = await this.projectModel.findOne({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan');
    }
    if (dto.name && dto.name !== project.name) {
      const existing = await this.projectModel.findOne({
        where: { organizationId, name: dto.name },
      });
      if (existing) {
        throw new BadRequestException('Nama proyek sudah dipakai di organization ini');
      }
    }

    await project.update({ name: dto.name, updatedBy: actorId });
    return { project: project.toJSON() };
  }

  /** Soft delete: archive the project (its code stops working). */
  async deleteProject(projectId: string, organizationId: string, actorId: string) {
    const project = await this.projectModel.findOne({
      where: { id: projectId, organizationId },
    });
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan');
    }

    await this.sequelize.transaction(async (transaction) => {
      await project.update({ status: RecordStatus.ARCHIVED, updatedBy: actorId }, { transaction });
      await this.invitationCodeModel.update(
        { status: InvitationCodeStatus.REVOKED, updatedBy: actorId },
        { where: { projectId: project.id }, transaction },
      );
    });

    return { message: 'Proyek berhasil diarsipkan', projectId: project.id };
  }

  private async generateUniqueInvitationCode(projectName: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateOrganizationCode(projectName);
      const existing = await this.invitationCodeModel.findOne({ where: { code } });
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException(
      'Gagal membuat kode undangan yang unik, silakan coba lagi',
    );
  }
}
