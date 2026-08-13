import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Notification } from '../../database/models/notification.model';

@Module({
  imports: [SequelizeModule.forFeature([Notification])],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
