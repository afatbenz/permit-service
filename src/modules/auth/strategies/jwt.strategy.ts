import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RecordStatus } from '../../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

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
    const user = await this.usersService.findById(payload.sub);

    // Re-check on every request instead of trusting the token blindly —
    // catches accounts deactivated after the token was issued.
    if (!user || user.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException('Akun tidak valid atau sudah tidak aktif');
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      roleId: user.roleId,
      roleCode: payload.roleCode,
    };
  }
}
