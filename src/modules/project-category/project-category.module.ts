import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProjectCategoryController } from './project-category.controller';
import { ProjectCategoryService } from './project-category.service';
import { PermitCategory } from '../../database/models/permit-category.model';
import { Project } from '../../database/models/project.model';
import { Role } from '../../database/models/role.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';

@Module({
  imports: [SequelizeModule.forFeature([PermitCategory, Project, Role, UserProjectAssignment])],
  controllers: [ProjectCategoryController],
  providers: [ProjectCategoryService],
  exports: [ProjectCategoryService],
})
export class ProjectCategoryModule {}
