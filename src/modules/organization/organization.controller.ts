import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteOrganizationDto } from './dto/invite-organization.dto';
import { JoinOrganizationDto } from './dto/join-organization.dto';
import { JoinOrganizationByTokenDto } from './dto/join-organization-by-token.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // Authenticated only (JwtAuthGuard still applies). New accounts without an
  // org ('unassigned') use this to onboard by creating their organization;
  // the account is promoted to org_admin of the new org.
  @Post()
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.organizationService.createOrganization(dto, user.id);
  }

  // Authenticated join-by-invitation-code. The account is already registered;
  // joining moves them into the code's org (as supervisor_subcon) and creates
  // a pending member_requests row awaiting org-admin approval.
  @Post('join-code')
  joinByCode(
    @Body() dto: JoinOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.joinOrganizationByCode(dto, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Post(':id/invite')
  invite(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: InviteOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Org Admin can only invite within their own organization; Super Admin
    // can invite into any organization.
    if (user.roleCode === RoleCode.ORG_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa membuat invite untuk organization lain');
    }
    return this.organizationService.invite(organizationId, dto, user.id);
  }

  @Public()
  @Post('join')
  join(@Body() dto: JoinOrganizationByTokenDto) {
    return this.organizationService.join(dto);
  }

  // --- Org settings (Org Admin of that org, or Super Admin) ---

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Get(':id/settings')
  getSettings(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.roleCode === RoleCode.ORG_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa melihat organization lain');
    }
    return this.organizationService.getOrganization(organizationId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Patch(':id/settings')
  updateSettings(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.roleCode === RoleCode.ORG_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa mengubah organization lain');
    }
    return this.organizationService.updateOrganization(organizationId, dto, user.id);
  }

  // Member project_admin needs the org's projects + members to manage the
  // people in the project they admin. The data is org-internal: any
  // authenticated user may view their OWN org's projects (super_admin any org).
  @Get(':id/projects')
  orgProjects(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.roleCode !== RoleCode.SUPER_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa melihat proyek organization lain');
    }
    return this.organizationService.listOrgProjectsWithMembers(organizationId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Get(':id/invitation-codes')
  invitationCodes(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.roleCode === RoleCode.ORG_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa melihat kode undangan organization lain');
    }
    return this.organizationService.getInvitationCodes(organizationId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Get('roles')
  assignableRoles() {
    return this.organizationService.listAssignableRoles();
  }

  // --- Member join-by-code requests (Org Admin of that org, or Super Admin) ---

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Get(':id/member-requests')
  listMemberRequests(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.roleCode === RoleCode.ORG_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa melihat permintaan organization lain');
    }
    return this.organizationService.listMemberRequests(organizationId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Post('member-requests/:requestId/approve')
  approveMemberRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.approveMemberRequest(requestId, user.id, user.organizationId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Post('member-requests/:requestId/reject')
  rejectMemberRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.rejectMemberRequest(requestId, user.id, user.organizationId);
  }

  // --- User management (Org Admin of that org, or Super Admin) ---

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Get(':id/users')
  listUsers(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Org Admin can only view users of their own organization.
    if (user.roleCode === RoleCode.ORG_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa melihat user organization lain');
    }
    return this.organizationService.listUsers(organizationId);
  }

  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  @Patch(':id/users/:userId/role')
  updateUserRole(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Org Admin can only manage users of their own organization.
    if (user.roleCode === RoleCode.ORG_ADMIN && user.organizationId !== organizationId) {
      throw new ForbiddenException('Tidak bisa mengubah user organization lain');
    }
    return this.organizationService.updateUserRole(organizationId, userId, dto, user.id);
  }

  // --- Project-scoped role management (project_admin of the project, or an
  // admin of the project's organization) ---
  //
  // No @Roles(...) here: a project_admin is recognized by their ACTIVE
  // assignment's per-project role (user_project_assignments.role_id), which
  // can differ from their global role. The service enforces the authorization
  // (org admin of that org, or the project_admin of that project).

  @Patch('projects/:projectId/users/:userId/role')
  updateProjectUserRole(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.updateProjectUserRole(
      projectId,
      userId,
      dto,
      user.id,
      user.roleCode,
      user.organizationId,
    );
  }

  // --- Super Admin approval gate for accounts stuck in 'pending' ---
  // (self-registered Sub-Con Supervisors AND users from the join flow above)

  @Roles(RoleCode.SUPER_ADMIN)
  @Post('users/:userId/approve')
  approveUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.approveUser(userId, user.id);
  }

  @Roles(RoleCode.SUPER_ADMIN)
  @Post('users/:userId/reject')
  rejectUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationService.rejectUser(userId, user.id);
  }
}
