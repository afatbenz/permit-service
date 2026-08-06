import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { RoleCode } from '../../common/enums/role-code.enum';
import { ForbiddenException } from '@nestjs/common';

/**
 * Multipart field name for the uploaded signature image.
 * (The same handler also accepts JSON with `signature` base64 — see DTO.)
 */
const SIGNATURE_FILE_FIELD = 'file';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * Update profile fields + (optionally) signature image.
   *
   * Accepts two payload shapes in one handler:
   *  - multipart/form-data  field `file` (file picker)
   *  - application/json     `{ signature: "data:image/png;base64,...", name?, email?, ... }`
   *
   * The controller detects the source (req.file vs body.signature) and the
   * service processes the same buffer → storage pipeline. Auth (JwtAuthGuard)
   * applies; the user updates their OWN profile only.
   */
  @Put()
  @UseInterceptors(
    FileInterceptor(SIGNATURE_FILE_FIELD, {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  updateProfile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.profileService.updateProfile(user.id, file, dto);
  }

  /** Returns the caller's profile + signature info (for prefill in the UI). */
  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.profileService.getProfile(user.id);
  }

  /**
   * Serve the authenticated user's own signature image. Ownership enforced:
   * user can only read their own signature; Super Admin (platform role) may
   * read any. Never served via static files.
   */
  @Get('signature')
  async serveOwnSignature(@CurrentUser() user: AuthenticatedUser, @Res() res: Response) {
    const { data, mimeType } = await this.profileService.readSignature(user.id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }

  /**
   * Super Admin can read another user's signature by id (e.g. for PDF
   * generation / approval snapshot). Non-super-admin is forbidden.
   */
  @Get('signature/users/:userId')
  async serveUserSignature(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    if (user.roleCode !== RoleCode.SUPER_ADMIN && user.id !== userId) {
      throw new ForbiddenException('Tidak bisa mengakses signature user lain');
    }
    const { data, mimeType } = await this.profileService.readSignature(userId);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(data);
  }
}
