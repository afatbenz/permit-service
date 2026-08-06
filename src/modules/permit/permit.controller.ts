import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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

const EVIDENCE_MAX_FILES = 10;
const EVIDENCE_FILE_FIELD = 'files';

/**
 * E-Permit evidence endpoints.
 *
 * Upload payload (multipart/form-data):
 *   files : repeated key `files` — one per file (max 10).
 *   types : single JSON-encoded array string, index-aligned to `files`.
 *           e.g. types = '["SITE_MAP","EQUIPMENT","OTHER"]'
 *
 * Example fetch:
 *   const fd = new FormData();
 *   fd.append('files', f0); fd.append('files', f1);
 *   fd.append('types', JSON.stringify(['SITE_MAP', 'EQUIPMENT']));
 *   await fetch('/api/v1/permits/<permitId>/evidences', { method: 'POST', body: fd });
 */
@Controller('permits/:permitId/evidences')
export class PermitController {
  constructor(private readonly permitService: PermitService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor(EVIDENCE_FILE_FIELD, EVIDENCE_MAX_FILES, {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  upload(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Query('types') typesRaw?: string,
  ) {
    const types = this.parseTypes(typesRaw);
    return this.permitService.uploadEvidence(permitId, files ?? [], types, user);
  }

  @Get()
  list(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Query('evidenceType') evidenceType: EvidenceType | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (evidenceType && !Object.values(EvidenceType).includes(evidenceType)) {
      throw new BadRequestException(`evidenceType tidak valid: ${evidenceType}`);
    }
    return this.permitService.listEvidence(permitId, evidenceType, user);
  }

  @Get(':evidenceId/file')
  async serve(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { data, mimeType } = await this.permitService.readEvidence(permitId, evidenceId, user);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }

  @Delete(':evidenceId')
  remove(
    @Param('permitId', ParseUUIDPipe) permitId: string,
    @Param('evidenceId', ParseUUIDPipe) evidenceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.permitService.deleteEvidence(permitId, evidenceId, user);
  }

  /**
   * Parses the `types` query/field (JSON-encoded array string) into an
   * array of EvidenceType. Sent as a query param so it survives the
   * multipart parser without extra body plumbing.
   */
  private parseTypes(typesRaw: string | undefined): EvidenceType[] {
    if (!typesRaw) {
      throw new BadRequestException('Field "types" wajib diisi (JSON array string).');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(typesRaw);
    } catch {
      throw new BadRequestException('Field "types" harus berupa JSON array string, mis. ["SITE_MAP"].');
    }
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('Field "types" harus berupa array.');
    }
    for (const t of parsed) {
      if (typeof t !== 'string' || !Object.values(EvidenceType).includes(t as EvidenceType)) {
        throw new BadRequestException(`evidenceType tidak valid: ${String(t)}`);
      }
    }
    return parsed as EvidenceType[];
  }
}
