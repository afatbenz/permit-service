import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SequelizeModule } from '@nestjs/sequelize';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../../redis/redis.module';
import { RegistrationLink } from '../../database/models/registration-link.model';
import { SubconCompany } from '../../database/models/subcon-company.model';
import { Organization } from '../../database/models/organization.model';
import { Role } from '../../database/models/role.model';
import { RefreshToken } from '../../database/models/refresh-token.model';

@Module({
  imports: [
    UsersModule,
    RedisModule,
    PassportModule,
    SequelizeModule.forFeature([RegistrationLink, SubconCompany, Organization, Role, RefreshToken]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiresIn') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
