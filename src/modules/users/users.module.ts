import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { User } from '../../database/models/user.model';
import { Role } from '../../database/models/role.model';
import { UserRepository } from './repositories/user.repository';
import { UsersService } from './users.service';

@Module({
  imports: [SequelizeModule.forFeature([User, Role])],
  providers: [UserRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
