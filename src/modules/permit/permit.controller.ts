import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { PermitService } from './permit.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { EvidenceType } from '../../common/enums/evidence-type.enum';
import { CreatePermitDto } from './dto/create-permit.dto';
import { UpdatePermitDto } from './dto/update-permit.dto';
import { UpdatePermitStatusDto } from './dto/update-permit-status.dto';

const EVIDENCE_MAX_FILES = 10;
const EVIDENCE_FILE_FIELD = 'files';

/**
 * Permit-to-work records + evidence attachments.
 *
 * Routes under `permits/:permitId/evidences` are inherited from the
 * evidence-only controller that used to live here.
 *
 * Access is enforced in the service (project-scoped, assignment-based) —
 * no @Roles(...), matching the bank-question / project-user-role pattern:
 * a project member is recognized by their ACTIVE per-project assignment,
 * not their global role.
 */
@Controller()
export class PermitController {
  constructor(private readonly permitService: PermitService) {}

  // ---- Permit CRUD ------------------------------------------------------

  @Get('permits')
  list(
    @Query('projectId') projectId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.permitService.list(
      projectId ? projectId : null,
      user!,
      user!.organizationId,
    );
  }

  @Get('permits/:permitId')
  findOne(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.permitService.findOne(permitId, user!, user!.organizationId);
  }

  @Post('permits')
  create(
    @Body() dto: CreatePermitDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.permitService.create(dto.projectId, dto, user!, user!.organizationId);
  }

  @Patch('permits/:permitId')
  update(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Body() dto: UpdatePermitDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.permitService.update(permitId, dto, user!, user!.organizationId);
  }

  @Patch('permits/:permitId/status')
  updateStatus(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Body() dto: UpdatePermitStatusDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.permitService.updateStatus(permitId, dto, user!, user!.organizationId);
  }

  @Delete('permits/:permitId')
  remove(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.permitService.remove(permitId, user!, user!.organizationId);
  }

  // ---- Evidence (inherited) ---------------------------------------------

  @Post('permits/:permitId/evidences')
  @UseInterceptors(
    FilesInterceptor(EVIDENCE_FILE_FIELD, EVIDENCE_MAX_FILES, {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user?: AuthenticatedUser,
    @Query('types') typesRaw?: string,
  ) {
    const types = this.parseTypes(typesRaw);
    return this.permitService.uploadEvidence(permitId, files ?? [], types, user!);
  }

  @Get('permits/:permitId/evidences')
  listEvidences(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Query('evidenceType') evidenceType: EvidenceType | undefined,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (evidenceType && !Object.values(EvidenceType).includes(evidenceType)) {
      throw new BadRequestException(`evidenceType tidak valid: ${evidenceType}`);
    }
    return this.permitService.listEvidence(permitId, evidenceType, user!);
  }

  @Get('permits/:permitId/evidences/:evidenceId/file')
  async evidenceFile(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @Res() res: Response,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const { data, mimeType } = await this.permitService.readEvidence(permitId, evidenceId, user!);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }

  @Delete('permits/:permitId/evidences/:evidenceId')
  removeEvidence(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.permitService.deleteEvidence(permitId, evidenceId, user!);
  }

  private parseTypes(typesRaw?: string): EvidenceType[] {
    if (!typesRaw) return [];
    try {
      const parsed = JSON.parse(typesRaw);
      if (!Array.isArray(parsed)) {
        throw new BadRequestException('Parameter types harus berupa array JSON');
      }
      return parsed.filter((t): t is EvidenceType =>
        Object.values(EvidenceType).includes(t as EvidenceType),
      );
    } catch {
      throw new BadRequestException('Parameter types harus berupa array JSON yang valid');
    }
  }
}
