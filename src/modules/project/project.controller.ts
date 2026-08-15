import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RoleCode } from '../../common/enums/role-code.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

/**
 * Project CRUD. Admin routes (list/create/update/delete) are org-scoped
 * against the caller; `mine` is open to any authenticated user and returns
 * the projects they are actively assigned to.
 */
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.projectService.listMyProjects(user.id, user.organizationId);
  }

  @Get()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.projectService.listProjects(user.organizationId);
  }

  @Post()
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  create(
    @Body() dto: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectService.createProject(user.organizationId, dto, user.id);
  }

  @Get(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  get(
    @Param('id', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectService.getProject(projectId, user.organizationId);
  }

  @Patch(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  update(
    @Param('id', ParseUUIDPipe) projectId: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectService.updateProject(projectId, dto, user.organizationId, user.id);
  }

  @Delete(':id')
  @Roles(RoleCode.SUPER_ADMIN, RoleCode.ORG_ADMIN)
  remove(
    @Param('id', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectService.deleteProject(projectId, user.organizationId, user.id);
  }
}
