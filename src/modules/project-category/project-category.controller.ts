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
import { ProjectCategoryService } from './project-category.service';
import { CreateProjectCategoryDto } from './dto/create-project-category.dto';
import { UpdateProjectCategoryDto } from './dto/update-project-category.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

/**
 * Permit categories for one project. Reads are open to any authenticated
 * user (the new-permit form's dropdown); mutations require super_admin,
 * the project's org_admin, or the project's project_admin.
 */
@Controller('projects/:projectId/categories')
export class ProjectCategoryController {
  constructor(private readonly categoryService: ProjectCategoryService) {}

  @Get()
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoryService.resolve(projectId, user.organizationId, user);
  }

  @Post()
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateProjectCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoryService.create(projectId, dto, user.organizationId, user);
  }

  @Patch(':categoryId')
  updateColor(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Body() dto: UpdateProjectCategoryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoryService.updateColor(projectId, categoryId, dto, user.organizationId, user);
  }

  @Delete(':categoryId')
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.categoryService.remove(projectId, categoryId, user.organizationId, user);
  }
}
