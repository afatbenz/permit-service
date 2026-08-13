import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationRepository } from './repositories/organization.repository';
import { UsersModule } from '../users/users.module';
import { Organization } from '../../database/models/organization.model';
import { User } from '../../database/models/user.model';
import { Role } from '../../database/models/role.model';
import { Project } from '../../database/models/project.model';
import { OrganizationInvite } from '../../database/models/organization-invite.model';
import { ProjectInvitationCode } from '../../database/models/project-invitation-code.model';
import { MemberRequest } from '../../database/models/member-request.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';
import { Notification } from '../../database/models/notification.model';

@Module({
  imports: [
    UsersModule,
    SequelizeModule.forFeature([
      Organization,
      User,
      Role,
      Project,
      OrganizationInvite,
      ProjectInvitationCode,
      MemberRequest,
      UserProjectAssignment,
      Notification,
    ]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRepository],
  exports: [OrganizationService],
})
export class OrganizationModule {}
