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
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { OrganizationRepository } from './repositories/organization.repository';
import { UsersService } from '../users/users.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteOrganizationDto } from './dto/invite-organization.dto';
import { JoinOrganizationDto } from './dto/join-organization.dto';
import { JoinOrganizationByTokenDto } from './dto/join-organization-by-token.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { Role } from '../../database/models/role.model';
import { Organization } from '../../database/models/organization.model';
import { User } from '../../database/models/user.model';
import { Project } from '../../database/models/project.model';
import { OrganizationInvite } from '../../database/models/organization-invite.model';
import { ProjectInvitationCode } from '../../database/models/project-invitation-code.model';
import { MemberRequest } from '../../database/models/member-request.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';
import { Notification } from '../../database/models/notification.model';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { InviteStatus } from '../../common/enums/invite-status.enum';
import { MemberRequestStatus } from '../../common/enums/member-request-status.enum';
import { InvitationCodeStatus } from '../../common/enums/invitation-code-status.enum';
import { RoleCode } from '../../common/enums/role-code.enum';
import { generateOrganizationCode } from '../../common/utils/organization-code.util';

const SALT_ROUNDS = 10;
const INVITE_TOKEN_BYTES = 32;
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CODE_GENERATION_ATTEMPTS = 5;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly usersService: UsersService,
    @InjectModel(Role) private readonly roleModel: typeof Role,
    @InjectModel(Project) private readonly projectModel: typeof Project,
    @InjectModel(Organization) private readonly organizationModel: typeof Organization,
    @InjectModel(OrganizationInvite) private readonly inviteModel: typeof OrganizationInvite,
    @InjectModel(ProjectInvitationCode)
    private readonly invitationCodeModel: typeof ProjectInvitationCode,
    @InjectModel(MemberRequest) private readonly memberRequestModel: typeof MemberRequest,
    @InjectModel(UserProjectAssignment)
    private readonly assignmentModel: typeof UserProjectAssignment,
    @InjectModel(Notification) private readonly notificationModel: typeof Notification,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  /**
   * Onboarding: an authenticated account in the 'unassigned' pre-org state
   * creates their organization and is promoted to org_admin of it.
   *
   * In the same transaction we also create the organization's first (default)
   * project — named after the organization — plus its project invitation code,
   * and register the creator as the project's first member. Per the
   * project_admin rule ("first user added to a project is its project_admin"),
   * the creator becomes project_admin of the default project.
   *
   * The legacy Super Admin path (creates a fresh org_admin account) has been
   * removed — the only entry point now is an existing 'unassigned' account.
   */
  async createOrganization(dto: CreateOrganizationDto, createdBy: string) {
    const creator = await this.usersService.findById(createdBy);
    if (!creator) {
      throw new BadRequestException('User tidak ditemukan');
    }

    const creatorRole = await this.roleModel.findByPk(creator.roleId);
    if (creatorRole?.code !== 'unassigned') {
      throw new ForbiddenException(
        'Anda sudah memiliki organisasi. Tidak bisa membuat organisasi baru.',
      );
    }

    const orgAdminRole = await this.roleModel.findOne({ where: { code: RoleCode.ORG_ADMIN } });
    const projectAdminRole = await this.roleModel.findOne({
      where: { code: RoleCode.PROJECT_ADMIN },
    });
    if (!orgAdminRole || !projectAdminRole) {
      // Should never happen — roles are created by migration 006 / seed:roles.
      throw new InternalServerErrorException(
        'Role org_admin / project_admin belum ter-seed di database',
      );
    }

    const code = await this.generateUniqueOrganizationCode(dto.organizationName);
    const defaultProjectCode = await this.generateUniqueProjectCode(dto.organizationName);

    return this.sequelize.transaction(async (transaction) => {
      const organization = await this.organizationRepository.create(
        {
          name: dto.organizationName,
          code,
          address: dto.address ?? null,
          city: dto.city,
          province: dto.province,
          createdBy,
        },
        { transaction },
      );

      // Default project + its invitation code + the creator's membership.
      const defaultProject = await this.projectModel.create(
        {
          organizationId: organization.id,
          projectCode: defaultProjectCode,
          name: dto.organizationName,
          projectAdminId: createdBy,
          status: RecordStatus.ACTIVE,
          createdBy,
        },
        { transaction },
      );

      const invitationCode = await this.generateUniqueInvitationCode(dto.organizationName);
      await this.invitationCodeModel.create(
        {
          organizationId: organization.id,
          projectId: defaultProject.id,
          code: invitationCode,
          status: InvitationCodeStatus.ACTIVE,
          createdBy,
        },
        { transaction },
      );

      await this.assignmentModel.create(
        {
          organizationId: organization.id,
          userId: createdBy,
          projectId: defaultProject.id,
          status: RecordStatus.ACTIVE,
          createdBy,
        },
        { transaction },
      );

      // Promote the existing account to org_admin of its new org.
      await this.usersService.updateOrganizationAndRole(
        createdBy,
        organization.id,
        orgAdminRole.id,
        { transaction },
      );

      return {
        organization: organization.toJSON(),
        defaultProject: {
          id: defaultProject.id,
          projectCode: defaultProject.projectCode,
          name: defaultProject.name,
        },
        invitationCode,
        promoted: true,
      };
    });
  }

  /**
   * Authenticated join-by-invitation-code. The calling account is already
   * registered ('unassigned' / PENDING org) or already a member of the code's
   * organization.
   *
   * Rules:
   * - A user not yet onboarded is moved into the code's organization with
   *   role 'supervisor_subcon' (the join-by-code default role).
   * - A user already inside another real organization is rejected — each user
   *   may hold multiple projects but only within the SAME organization.
   * - The join produces a member_requests row (pending org-admin approval)
   *   and a user_project_assignments row with status 'inactive'. The user is
   *   not active in the project until an admin approves.
   * - Org admins are notified of the pending request.
   */
  async joinOrganizationByCode(dto: JoinOrganizationDto, userId: string) {
    const codeRow = await this.invitationCodeModel.findOne({
      where: { code: dto.invitationCode, status: InvitationCodeStatus.ACTIVE },
    });
    if (!codeRow) {
      throw new BadRequestException('Kode undangan tidak valid atau sudah tidak aktif');
    }

    const project = await this.projectModel.findByPk(codeRow.projectId);
    if (!project || project.organizationId !== codeRow.organizationId) {
      throw new BadRequestException('Kode undangan tidak valid atau sudah tidak aktif');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }

    // Enforce "multiple projects, but only within the SAME organization".
    const currentOrg = await this.organizationRepository.findById(user.organizationId);
    const isPendingOrg = currentOrg?.code === 'PENDING';
    if (!isPendingOrg && user.organizationId !== codeRow.organizationId) {
      throw new ForbiddenException(
        'Kode undangan ini untuk organisasi lain. Anda hanya bisa bergabung ke proyek pada organisasi yang sama.',
      );
    }

    // Same project already requested or active → no double-join.
    const existingAssignment = await this.assignmentModel.findOne({
      where: { userId, projectId: project.id },
    });
    if (existingAssignment && existingAssignment.status === RecordStatus.ACTIVE) {
      throw new ConflictException('Anda sudah tergabung di proyek ini');
    }
    const existingRequest = await this.memberRequestModel.findOne({
      where: { userId, projectId: project.id },
    });
    if (existingRequest && existingRequest.status === MemberRequestStatus.PENDING) {
      throw new ConflictException('Permintaan bergabung Anda masih menunggu approval admin');
    }

    const supervisorSubconRole = await this.roleModel.findOne({
      where: { code: RoleCode.SUPERVISOR_SUBCON },
    });

    return this.sequelize.transaction(async (transaction) => {
      if (isPendingOrg) {
        // First org: move the account into the code's org as supervisor_subcon.
        await this.usersService.updateOrganizationAndRole(
          userId,
          codeRow.organizationId,
          supervisorSubconRole!.id,
          { transaction },
        );
      }

      // Upsert the member request (a rejected user can re-request).
      if (existingRequest) {
        await existingRequest.update(
          { status: MemberRequestStatus.PENDING, approvedBy: null, approvedAt: null },
          { transaction },
        );
      } else {
        await this.memberRequestModel.create(
          {
            organizationId: codeRow.organizationId,
            projectId: project.id,
            userId,
            status: MemberRequestStatus.PENDING,
            createdBy: userId,
          },
          { transaction },
        );
      }

      // Upsert the (inactive until approved) project assignment.
      if (existingAssignment) {
        await existingAssignment.update(
          { status: RecordStatus.INACTIVE },
          { transaction },
        );
      } else {
        await this.assignmentModel.create(
          {
            organizationId: codeRow.organizationId,
            userId,
            projectId: project.id,
            status: RecordStatus.INACTIVE,
            createdBy: userId,
          },
          { transaction },
        );
      }

      await this.notifyOrgAdmins(codeRow.organizationId, {
        type: 'member_join_request',
        title: 'Permintaan bergabung proyek',
        message: `${user.name} meminta bergabung ke proyek "${project.name}".`,
        data: { projectId: project.id, userId, codeRowId: codeRow.id },
        createdBy: userId,
        transaction,
      });

      return {
        message: 'Permintaan bergabung terkirim. Menunggu approval admin organisasi.',
        project: { id: project.id, name: project.name, projectCode: project.projectCode },
        status: 'pending',
      };
    });
  }

  /**
   * Org-scope (enforced in controller): approve a pending join-by-code request.
   * Flips the assignment to active and — if the project has no project_admin
   * yet — the approved user becomes the project's first project_admin
   * ("first user added to a project is its project_admin").
   */
  async approveMemberRequest(
    requestId: string,
    approvedBy: string,
    actorOrganizationId: string,
  ) {
    const request = await this.memberRequestModel.findByPk(requestId);
    if (!request) {
      throw new NotFoundException('Permintaan tidak ditemukan');
    }
    if (request.organizationId !== actorOrganizationId) {
      throw new ForbiddenException('Tidak bisa menyetujui permintaan organization lain');
    }
    if (request.status !== MemberRequestStatus.PENDING) {
      throw new BadRequestException(
        `Permintaan ini berstatus '${request.status}', bukan 'pending'`,
      );
    }

    const user = await this.usersService.findById(request.userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    const project = await this.projectModel.findByPk(request.projectId);
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan');
    }

    const projectAdminRole = await this.roleModel.findOne({
      where: { code: RoleCode.PROJECT_ADMIN },
    });
    if (!projectAdminRole) {
      throw new InternalServerErrorException('Role project_admin belum ter-seed di database');
    }

    return this.sequelize.transaction(async (transaction) => {
      await request.update(
        {
          status: MemberRequestStatus.APPROVED,
          approvedBy,
          approvedAt: new Date(),
          updatedBy: approvedBy,
        },
        { transaction },
      );

      await this.assignmentModel.update(
        { status: RecordStatus.ACTIVE, updatedBy: approvedBy },
        { where: { userId: request.userId, projectId: project.id }, transaction },
      );

      // First approved member of a project without a project_admin becomes
      // that project's project_admin (role promoted accordingly).
      if (!project.projectAdminId) {
        await project.update(
          { projectAdminId: request.userId, updatedBy: approvedBy },
          { transaction },
        );
        await this.usersService.updateOrganizationAndRole(
          request.userId,
          project.organizationId,
          projectAdminRole.id,
          { transaction },
        );
      }

      await this.notificationModel.create(
        {
          organizationId: project.organizationId,
          recipientId: request.userId,
          type: 'member_join_approved',
          title: 'Permintaan bergabung disetujui',
          message: `Anda disetujui bergabung ke proyek "${project.name}".`,
          data: { projectId: project.id },
          createdBy: approvedBy,
        },
        { transaction },
      );

      return {
        message: 'User berhasil di-approve bergabung ke proyek',
        userId: request.userId,
        projectId: project.id,
        projectAdmin: !project.projectAdminId,
      };
    });
  }

  /** Org-scope (enforced in controller): reject a pending join-by-code request. */
  async rejectMemberRequest(
    requestId: string,
    rejectedBy: string,
    actorOrganizationId: string,
  ) {
    const request = await this.memberRequestModel.findByPk(requestId);
    if (!request) {
      throw new NotFoundException('Permintaan tidak ditemukan');
    }
    if (request.organizationId !== actorOrganizationId) {
      throw new ForbiddenException('Tidak bisa menolak permintaan organization lain');
    }
    if (request.status !== MemberRequestStatus.PENDING) {
      throw new BadRequestException(
        `Permintaan ini berstatus '${request.status}', bukan 'pending'`,
      );
    }

    const project = await this.projectModel.findByPk(request.projectId);
    const projectName = project?.name ?? 'Proyek';

    await this.sequelize.transaction(async (transaction) => {
      await request.update(
        { status: MemberRequestStatus.REJECTED, updatedBy: rejectedBy },
        { transaction },
      );

      await this.notificationModel.create(
        {
          organizationId: request.organizationId,
          recipientId: request.userId,
          type: 'member_join_rejected',
          title: 'Permintaan bergabung ditolak',
          message: `Permintaan Anda bergabung ke proyek "${projectName}" ditolak oleh admin.`,
          data: { projectId: request.projectId },
          createdBy: rejectedBy,
        },
        { transaction },
      );
    });

    return { message: 'Permintaan bergabung ditolak', userId: request.userId };
  }

  /** Org-scope: list member requests (with user + project info) for a UI page. */
  async listMemberRequests(organizationId: string) {
    const requests = await this.memberRequestModel.findAll({
      where: { organizationId },
      order: [['createdAt', 'DESC']],
    });

    const userIds = [...new Set(requests.map((r) => r.userId))];
    const projectIds = [...new Set(requests.map((r) => r.projectId))];
    const [users, projects] = await Promise.all([
      userIds.length
        ? this.organizationModel.sequelize!.query(
            `SELECT id, name, email FROM users WHERE id = ANY(:ids)`,
            {
              replacements: { ids: userIds },
              type: 'SELECT',
            },
          )
        : [],
      projectIds.length
        ? this.projectModel.findAll({ where: { id: projectIds }, attributes: ['id', 'name'] })
        : [],
    ]);

    const userMap = new Map((users as Array<{ id: string; name: string; email: string }>).map((u) => [u.id, u]));
    const projectMap = new Map(
      (projects as Array<{ id: string; name: string }>).map((p) => [p.id, p.name] as [string, string]),
    );

    return {
      requests: requests.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        projectName: projectMap.get(r.projectId) ?? null,
        userId: r.userId,
        userName: userMap.get(r.userId)?.name ?? null,
        userEmail: userMap.get(r.userId)?.email ?? null,
        status: r.status,
        createdAt: r.createdAt,
      })),
    };
  }

  /** Org-settings card 1: update company name / address / city / province. */
  /** Org-settings card 1 prefill: current name/address/city/province. */
  async getOrganization(organizationId: string) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }
    return { organization: organization.toJSON() };
  }

  async updateOrganization(organizationId: string, dto: UpdateOrganizationDto, actorId: string) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }

    await organization.update({
      name: dto.name,
      address: dto.address,
      city: dto.city,
      province: dto.province,
      updatedBy: actorId,
    });

    return { organization: organization.toJSON() };
  }

  /** Org-settings card 2: active invitation codes with their project names. */
  async getInvitationCodes(organizationId: string) {
    const codes = await this.invitationCodeModel.findAll({
      where: { organizationId },
      order: [['createdAt', 'DESC']],
    });
    const projectIds = [...new Set(codes.map((c) => c.projectId))];
    const projects = projectIds.length
      ? await this.projectModel.findAll({
          where: { id: projectIds },
          attributes: ['id', 'name'],
        })
      : [];
    const projectMap = new Map(
      (projects as Array<{ id: string; name: string }>).map((p) => [p.id, p.name] as [string, string]),
    );

    return {
      codes: codes.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        projectName: projectMap.get(c.projectId) ?? null,
        code: c.code,
        status: c.status,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Org Admin (own org only) / Super Admin: list all projects in the org
   * (with active memberships), for role assignment UI.
   */
  async listOrgProjectsWithMembers(organizationId: string) {
    const [projects, assignments] = await Promise.all([
      this.projectModel.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']] }),
      this.assignmentModel.findAll({
        where: { organizationId, status: RecordStatus.ACTIVE },
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['id', 'name', 'email', 'roleId'],
            include: [{ model: Role, as: 'role', attributes: ['id', 'code', 'name'], required: false }],
            required: false,
          },
        ],
      }),
    ]);

    const grouped = new Map<
      string,
      Array<{ userId: string; name: string | null; email: string | null; roleId: string | null; roleCode: string | null; roleName: string | null }>
    >();
    for (const a of assignments) {
      const u = (a as any).user;
      const list = grouped.get(a.projectId) ?? [];
      list.push({
        userId: a.userId,
        name: u?.name ?? null,
        email: u?.email ?? null,
        roleId: u?.roleId ?? null,
        roleCode: u?.role?.code ?? null,
        roleName: u?.role?.name ?? null,
      });
      grouped.set(a.projectId, list);
    }

    return {
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        projectCode: p.projectCode,
        projectAdminId: p.projectAdminId,
        members: grouped.get(p.id) ?? [],
      })),
    };
  }

  /**
   * Org Admin (own org only) / Super Admin: reassign a user's role inside an
   * organization. project_admin is now assignable (1 project = 1 project_admin).
   * When assigning project_admin, a projectId (same org) is required and the
   * project's projectAdminId is set. When moving a user off a role, any
   * project they administered in this org is cleared.
   */
  async updateUserRole(
    organizationId: string,
    userId: string,
    dto: UpdateUserRoleDto,
    actorId: string,
  ) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.organizationId !== organizationId) {
      throw new ForbiddenException('User tidak berada pada organization ini');
    }
    if (userId === actorId) {
      throw new BadRequestException('Tidak bisa mengubah role akun Anda sendiri');
    }

    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role) {
      throw new BadRequestException('Role tidak ditemukan');
    }
    if (role.code === RoleCode.SUPER_ADMIN || role.code === RoleCode.UNASSIGNED) {
      throw new ForbiddenException(`Role '${role.code}' tidak bisa di-assign oleh admin organization`);
    }

    await this.sequelize.transaction(async (transaction) => {
      if (role.code === RoleCode.PROJECT_ADMIN) {
        if (!dto.projectId) {
          throw new BadRequestException(
            'Untuk role project_admin, proyek (projectId) harus ditentukan',
          );
        }
        const project = await this.projectModel.findOne({
          where: { id: dto.projectId, organizationId },
        });
        if (!project) {
          throw new BadRequestException('Proyek tidak ditemukan pada organization ini');
        }

        // Demote any existing project_admin of that project.
        if (project.projectAdminId && project.projectAdminId !== userId) {
          await this.assignmentModel.update(
            { status: RecordStatus.ACTIVE, updatedBy: actorId },
            { where: { userId, projectId: project.id }, transaction },
          );
        }

        await this.sequelize.query(
          `INSERT INTO user_project_assignments (id, organization_id, user_id, project_id, status, created_by, updated_by)
           VALUES (gen_random_uuid(), :orgId, :userId, :projectId, 'active', :actorId, :actorId)
           ON CONFLICT (user_id, project_id) DO NOTHING`,
          {
            replacements: {
              orgId: organizationId,
              userId,
              projectId: project.id,
              actorId,
            },
            transaction: transaction as any,
          },
        );

        await project.update(
          { projectAdminId: userId, updatedBy: actorId },
          { transaction },
        );
      } else if (user.roleId !== role.id) {
        // User leaving a project-admin role → clear their admin pointer(s).
        await this.projectModel.update(
          { projectAdminId: null, updatedBy: actorId },
          { where: { organizationId, projectAdminId: userId }, transaction },
        );
      }

      await this.usersService.updateOrganizationAndRole(userId, organizationId, role.id, {
        transaction,
      });
    });

    return {
      message: `Role user ${user.name} diubah menjadi ${role.name}`,
      userId,
      role: { id: role.id, code: role.code, name: role.name },
    };
  }

  /**
   * project_admin can set the role of other users in the same project.
   * Authorization (enforced here + controller): the actor must be the
   * project_admin of this project, or an org_admin / super_admin of the
   * project's organization. The target must be an active member of the project.
   */
  async updateProjectUserRole(
    projectId: string,
    userId: string,
    dto: UpdateUserRoleDto,
    actorId: string,
    actorRoleCode: RoleCode,
    actorOrganizationId: string,
  ) {
    const project = await this.projectModel.findByPk(projectId);
    if (!project) {
      throw new NotFoundException('Proyek tidak ditemukan');
    }

    const isOrgAdmin =
      (actorRoleCode === RoleCode.ORG_ADMIN || actorRoleCode === RoleCode.SUPER_ADMIN) &&
      actorOrganizationId === project.organizationId;
    const isProjectAdmin = actorRoleCode === RoleCode.PROJECT_ADMIN && project.projectAdminId === actorId;
    if (!isOrgAdmin && !isProjectAdmin) {
      throw new ForbiddenException('Anda tidak memiliki akses untuk mengubah role di proyek ini');
    }
    if (userId === actorId) {
      throw new BadRequestException('Tidak bisa mengubah role akun Anda sendiri');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.organizationId !== project.organizationId) {
      throw new ForbiddenException('User tidak berada pada organization proyek ini');
    }

    const assignment = await this.assignmentModel.findOne({
      where: { userId, projectId: project.id },
    });
    if (!assignment || assignment.status !== RecordStatus.ACTIVE) {
      throw new BadRequestException('User belum menjadi member aktif pada proyek ini');
    }

    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role) {
      throw new BadRequestException('Role tidak ditemukan');
    }
    if (role.code === RoleCode.SUPER_ADMIN || role.code === RoleCode.UNASSIGNED) {
      throw new ForbiddenException(`Role '${role.code}' tidak bisa di-assign oleh project_admin`);
    }

    await this.sequelize.transaction(async (transaction) => {
      if (role.code === RoleCode.PROJECT_ADMIN) {
        await project.update({ projectAdminId: userId, updatedBy: actorId }, { transaction });
      } else if (project.projectAdminId === userId) {
        // Moving the current project_admin to another role clears the pointer.
        await project.update({ projectAdminId: null, updatedBy: actorId }, { transaction });
      }

      await this.usersService.updateOrganizationAndRole(
        userId,
        project.organizationId,
        role.id,
        { transaction },
      );
    });

    return {
      message: `Role user ${user.name} diubah menjadi ${role.name}`,
      userId,
      role: { id: role.id, code: role.code, name: role.name },
    };
  }

  /**
   * Generates an organization code and retries on collision. The letters
   * portion is deterministic (derived from the name), so only the random
   * digit suffix changes between attempts.
   */
  private async generateUniqueOrganizationCode(organizationName: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateOrganizationCode(organizationName);
      const existing = await this.organizationRepository.findByCode(code);
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException(
      'Gagal membuat kode organization yang unik, silakan coba lagi',
    );
  }

  /** Project code, unique per organization (uq_projects_org_code). */
  private async generateUniqueProjectCode(projectName: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateOrganizationCode(projectName);
      const existing = await this.projectModel.findOne({
        where: { projectCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException(
      'Gagal membuat kode proyek yang unik, silakan coba lagi',
    );
  }

  /** Short human-typeable invitation code (UNIQUE platform-wide). */
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

  /** Creates a notification row for every org_admin / super_admin of an org. */
  private async notifyOrgAdmins(
    organizationId: string,
    data: {
      type: string;
      title: string;
      message: string;
      data: Record<string, unknown>;
      createdBy: string;
      transaction: any;
    },
  ) {
    const users = await this.usersService.listByOrganizationWithRole(organizationId);
    const admins = users.filter(
      (u) => u.role?.code === RoleCode.ORG_ADMIN || u.role?.code === RoleCode.SUPER_ADMIN,
    );
    await this.notificationModel.bulkCreate(
      admins.map((admin) => ({
        organizationId,
        recipientId: admin.id,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data,
        createdBy: data.createdBy,
      })),
      { transaction: data.transaction },
    );
  }

  /**
   * Org Admin (own org only) or Super Admin invites a user by email into a
   * specific role. No account is created yet — only an invite record with
   * a token. Actual account creation happens in join() once the invitee
   * accepts. Email delivery is intentionally out of scope here.
   */
  async invite(organizationId: string, dto: InviteOrganizationDto, invitedBy: string) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }

    const role = await this.roleModel.findOne({ where: { code: dto.roleCode } });
    if (!role) {
      throw new BadRequestException('Role tidak valid');
    }

    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar sebagai user');
    }

    const existingInvite = await this.inviteModel.findOne({
      where: { organizationId, email: dto.email, status: InviteStatus.PENDING },
    });
    if (existingInvite) {
      throw new ConflictException('Invite untuk email ini masih pending, tunggu sampai kedaluwarsa atau dipakai');
    }

    const token = randomBytes(INVITE_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

    const invite = await this.inviteModel.create({
      organizationId,
      projectId: dto.projectId ?? null,
      email: dto.email,
      roleId: role.id,
      token,
      status: InviteStatus.PENDING,
      expiresAt,
      createdBy: invitedBy,
    });

    return {
      message: 'Invite berhasil dibuat. Kirimkan joinToken ini ke user via email/undangan.',
      inviteId: invite.id,
      email: invite.email,
      roleCode: role.code,
      joinToken: invite.token,
      expiresAt: invite.expiresAt,
    };
  }

  /**
   * Public endpoint — invitee completes their account using the token they
   * received. Kept for the legacy invite flow; new onboarding uses
   * joinOrganizationByCode.
   */
  async join(dto: JoinOrganizationByTokenDto) {
    const invite = await this.inviteModel.findOne({ where: { token: dto.inviteToken } });
    if (!invite) {
      throw new BadRequestException('Invite token tidak valid');
    }
    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException('Invite sudah digunakan, dicabut, atau kedaluwarsa');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await invite.update({ status: InviteStatus.EXPIRED });
      throw new BadRequestException('Invite sudah kedaluwarsa');
    }

    const existingUser = await this.usersService.findByEmail(invite.email);
    if (existingUser) {
      throw new ConflictException('Email pada invite ini sudah memiliki akun');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    return this.sequelize.transaction(async (transaction) => {
      const user = await this.usersService.create(
        {
          organizationId: invite.organizationId,
          roleId: invite.roleId,
          name: dto.name,
          email: invite.email,
          phone: dto.phone,
          passwordHash,
          // Pending until Super Admin approves — see approveUser().
          verificationStatus: VerificationStatus.PENDING,
          status: RecordStatus.ACTIVE,
        },
        { transaction },
      );

      await invite.update(
        { status: InviteStatus.ACCEPTED, acceptedAt: new Date() },
        { transaction },
      );

      return {
        message: 'Akun berhasil dibuat, menunggu approval Super Admin sebelum bisa login',
        user: user.toSafeObject(),
      };
    });
  }

  /**
   * Super Admin only. Approves a user stuck in verification_status='pending'
   * — covers both self-registered Sub-Con Supervisors and users who just
   * completed the invite/join flow above.
   */
  async approveUser(userId: string, approvedBy: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.verificationStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        `User ini berstatus '${user.verificationStatus}', bukan 'pending'`,
      );
    }

    await this.usersService.updateVerification(userId, VerificationStatus.VERIFIED, approvedBy);

    return { message: 'User berhasil di-approve', userId };
  }

  /**
   * Super Admin only. Rejects a user stuck in verification_status='pending'.
   */
  async rejectUser(userId: string, rejectedBy: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.verificationStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        `User ini berstatus '${user.verificationStatus}', bukan 'pending'`,
      );
    }

    await this.usersService.updateVerification(userId, VerificationStatus.REJECTED, rejectedBy);

    return { message: 'User ditolak', userId };
  }

  /**
   * Roles an org_admin / project_admin may assign to users (org-assignable:
   * everything except super_admin and the pre-onboarding 'unassigned'
   * placeholder). Returns ids so the frontend role <select> can save them.
   */
  async listAssignableRoles() {
    const roles = await this.roleModel.findAll({
      where: {
        organizationId: null,
        code: {
          [Op.notIn]: [RoleCode.SUPER_ADMIN, RoleCode.UNASSIGNED],
        },
      },
      order: [['name', 'ASC']],
    });
    return {
      roles: roles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
      })),
    };
  }

  /**
   * Org Admin (own org only) / Super Admin: list every user in an
   * organization with their role, for the user-management screen.
   */
  async listUsers(organizationId: string) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }

    const users = await this.usersService.listByOrganizationWithRole(organizationId);

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        roleId: u.roleId,
        roleCode: u.role?.code ?? null,
        roleName: u.role?.name ?? null,
        verificationStatus: u.verificationStatus,
        status: u.status,
        createdAt: u.createdAt,
      })),
    };
  }
}
