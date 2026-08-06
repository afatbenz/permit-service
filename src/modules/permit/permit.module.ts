import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PermitEvidence } from '../../database/models/permit-evidence.model';
import { PermitService } from './permit.service';
import { PermitController } from './permit.controller';

/**
 * E-Permit module. Currently holds the evidence (attachment) feature only —
 * the permits table/entity does not exist yet. Extend here as the permit
 * workflow is built.
 */
@Module({
  imports: [SequelizeModule.forFeature([PermitEvidence])],
  controllers: [PermitController],
  providers: [PermitService],
  exports: [PermitService],
})
export class PermitModule {}
