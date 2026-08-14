import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { BankQuestionService } from './bank-question.service';
import { CreateBankQuestionDto } from './dto/create-bank-question.dto';
import { UpdateBankQuestionDto } from './dto/update-bank-question.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';

/**
 * Bank questions for one project. Reads are open to any authenticated user
 * (the new-permit form's checklist will consume them); mutations require
 * super_admin, the project's org_admin, or the project's project_admin.
 *
 * No @Roles(...) here: a project_admin is recognized by their ACTIVE
 * assignment's per-project role, which can differ from their global role
 * (same pattern as the updateProjectUserRole route). The service enforces
 * the authorization.
 */
@Controller('projects/:projectId/bank-questions')
export class BankQuestionController {
  constructor(private readonly bankQuestionService: BankQuestionService) {}

  @Get()
  list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankQuestionService.list(projectId, user.organizationId, user);
  }

  @Post()
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateBankQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankQuestionService.create(projectId, dto, user.organizationId, user);
  }

  @Patch(':questionId')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: UpdateBankQuestionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankQuestionService.update(projectId, questionId, dto, user.organizationId, user);
  }

  @Delete(':questionId')
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bankQuestionService.remove(projectId, questionId, user.organizationId, user);
  }
}
