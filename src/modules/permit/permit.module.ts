import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { Permit } from '../../database/models/permit.model';
import { PermitAnswer } from '../../database/models/permit-answer.model';
import { PermitBankQuestion } from '../../database/models/permit-bank-question.model';
import { PermitEvidence } from '../../database/models/permit-evidence.model';
import { Project } from '../../database/models/project.model';
import { Role } from '../../database/models/role.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';
import { PermitService } from './permit.service';
import { PermitController } from './permit.controller';

/**
 * E-Permit module. Permit-to-work records + their evidence attachments.
 */
@Module({
  imports: [
    SequelizeModule.forFeature([
      Permit,
      PermitAnswer,
      PermitBankQuestion,
      PermitEvidence,
      Project,
      Role,
      UserProjectAssignment,
    ]),
  ],
  controllers: [PermitController],
  providers: [PermitService],
  exports: [PermitService],
})
export class PermitModule {}
