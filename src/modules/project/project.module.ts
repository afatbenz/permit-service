import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { Project } from '../../database/models/project.model';
import { ProjectInvitationCode } from '../../database/models/project-invitation-code.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';
import { Role } from '../../database/models/role.model';

@Module({
  imports: [
    SequelizeModule.forFeature([Project, ProjectInvitationCode, UserProjectAssignment, Role]),
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
