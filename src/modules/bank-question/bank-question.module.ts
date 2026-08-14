import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { BankQuestionController } from './bank-question.controller';
import { BankQuestionService } from './bank-question.service';
import { PermitBankQuestion } from '../../database/models/permit-bank-question.model';
import { PermitCategory } from '../../database/models/permit-category.model';
import { Project } from '../../database/models/project.model';
import { Role } from '../../database/models/role.model';
import { UserProjectAssignment } from '../../database/models/user-project-assignment.model';

@Module({
  imports: [
    SequelizeModule.forFeature([
      PermitBankQuestion,
      PermitCategory,
      Project,
      Role,
      UserProjectAssignment,
    ]),
  ],
  controllers: [BankQuestionController],
  providers: [BankQuestionService],
  exports: [BankQuestionService],
})
export class BankQuestionModule {}
