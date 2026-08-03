import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { OrganizationRepository } from './repositories/organization.repository';
import { UsersModule } from '../users/users.module';
import { Organization } from '../../database/models/organization.model';
import { Role } from '../../database/models/role.model';
import { OrganizationInvite } from '../../database/models/organization-invite.model';

@Module({
  imports: [
    UsersModule,
    SequelizeModule.forFeature([Organization, Role, OrganizationInvite]),
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService, OrganizationRepository],
  exports: [OrganizationService],
})
export class OrganizationModule {}
