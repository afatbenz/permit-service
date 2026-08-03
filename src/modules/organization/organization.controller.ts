import {
  Body,
  Controller,
  ForbiddenException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteOrganizationDto } from './dto/invite-organization.dto';
import { JoinOrganizationDto } from './dto/join-organization.dto';
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
  join(@Body() dto: JoinOrganizationDto) {
    return this.organizationService.join(dto);
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
