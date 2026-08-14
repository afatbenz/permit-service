import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SequelizeModule } from '@nestjs/sequelize';
import { Organization } from './models/organization.model';
import { Role } from './models/role.model';
import { SubconCompany } from './models/subcon-company.model';
import { Project } from './models/project.model';
import { User } from './models/user.model';
import { UserProfile } from './models/user-profile.model';
import { RegistrationLink } from './models/registration-link.model';
import { OrganizationInvite } from './models/organization-invite.model';
import { RefreshToken } from './models/refresh-token.model';
import { PermitEvidence } from './models/permit-evidence.model';
import { ProjectInvitationCode } from './models/project-invitation-code.model';
import { MemberRequest } from './models/member-request.model';
import { Notification } from './models/notification.model';
import { UserProjectAssignment } from './models/user-project-assignment.model';
import { PermitCategory } from './models/permit-category.model';
import { PermitBankQuestion } from './models/permit-bank-question.model';

@Module({
  imports: [
    SequelizeModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        dialect: 'postgres',
        host: configService.get<string>('database.host'),
        port: configService.get<number>('database.port'),
        username: configService.get<string>('database.username'),
        password: configService.get<string>('database.password'),
        database: configService.get<string>('database.name'),
        // Schema is owned by the DDL scripts (ddl_auth_organization.sql +
        // migrations/*.sql), not by Sequelize — so sync is always off.
        synchronize: false,
        autoLoadModels: true,
        define: {
          underscored: true,
          timestamps: true,
        },
        models: [
          Organization,
          Role,
          SubconCompany,
          Project,
          User,
          UserProfile,
          RegistrationLink,
          OrganizationInvite,
          RefreshToken,
          PermitEvidence,
          ProjectInvitationCode,
          MemberRequest,
          Notification,
          UserProjectAssignment,
          PermitCategory,
          PermitBankQuestion,
        ],
        logging: false,
      }),
    }),
  ],
  exports: [SequelizeModule],
})
export class DatabaseModule {}
