import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { validationSchema } from './config/validation.schema';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './common/storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { ProfileModule } from './modules/profile/profile.module';
import { PermitModule } from './modules/permit/permit.module';
import { ProjectModule } from './modules/project/project.module';
import { ProjectCategoryModule } from './modules/project-category/project-category.module';
import { NotificationModule } from './modules/notification/notification.module';
import { LocationModule } from './modules/location/location.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
    }),
    DatabaseModule,
    RedisModule,
    StorageModule,
    AuthModule,
    UsersModule,
    OrganizationModule,
    ProfileModule,
    PermitModule,
    ProjectModule,
    ProjectCategoryModule,
    NotificationModule,
    LocationModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard runs first (populates req.user / respects
    // @Public), then RolesGuard checks req.user.roleCode against @Roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
