import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { RoleCode } from '../../../common/enums/role-code.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.usersService.findByIdWithRole(payload.sub);

    // Re-check on every request instead of trusting the token blindly —
    // catches accounts deactivated after the token was issued.
    if (!user || user.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException('Akun tidak valid atau sudah tidak aktif');
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      roleId: user.roleId,
      // Resolve the role from the DB on every request (not the token payload)
      // so a role change takes effect immediately — the token's roleCode can
      // go stale. roleCode here is the GLOBAL role (users.role_id), which
      // gates org-level admin pages; per-project roles are checked separately.
      roleCode: (user.role?.code as RoleCode) ?? payload.roleCode,
    };
  }
}
