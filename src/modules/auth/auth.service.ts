import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegistrationLink } from '../../database/models/registration-link.model';
import { SubconCompany } from '../../database/models/subcon-company.model';
import { Organization } from '../../database/models/organization.model';
import { Role } from '../../database/models/role.model';
import { RefreshToken } from '../../database/models/refresh-token.model';
import { User } from '../../database/models/user.model';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { RedisService } from '../../redis/redis.service';

const SALT_ROUNDS = 10;
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 1 day, mirrors default JWT expiry
const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/** SHA-256 hex digest — refresh tokens are never stored in plaintext. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @InjectModel(RegistrationLink) private readonly registrationLinkModel: typeof RegistrationLink,
    @InjectModel(SubconCompany) private readonly subconCompanyModel: typeof SubconCompany,
    @InjectModel(Organization) private readonly organizationModel: typeof Organization,
    @InjectModel(Role) private readonly roleModel: typeof Role,
    @InjectModel(RefreshToken) private readonly refreshTokenModel: typeof RefreshToken,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  /**
   * Issues a new refresh token for a user: generates a random opaque value,
   * persists only its SHA-256 hash, and returns the raw value (the only time
   * it's ever visible).
   */
  private async issueRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    await this.refreshTokenModel.create({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    });
    return token;
  }

  /**
   * General self-register: creates a basic account with no real organization
   * yet. The account gets the global 'unassigned' role and points at the
   * sentinel PENDING org (users.organization_id is NOT NULL) until the user
   * picks Create Organization or Join Organization after logging in.
   *
   * The old token-gated Supervisor Sub-Con registration moved to the
   * join-organization flow (invite/registration link).
   */
  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Konfirmasi password tidak sama');
    }

    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const role = await this.roleModel.findOne({
      where: { code: 'unassigned', organizationId: null },
    });
    if (!role) {
      // Should never happen — role is created by migration 004_onboarding.sql.
      throw new InternalServerErrorException('Role unassigned belum tersedia di database');
    }

    const pendingOrg = await this.organizationModel.findOne({
      where: { code: 'PENDING' },
      attributes: ['id'],
    });
    if (!pendingOrg) {
      // Should never happen — org is created by migration 004_onboarding.sql.
      throw new InternalServerErrorException('Organisasi placeholder belum tersedia');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.usersService.create({
      organizationId: pendingOrg.id,
      subconCompanyId: null,
      roleId: role.id,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      passwordHash,
      // Auto-verified: the account is usable immediately, but has no
      // organization yet — Create/Join resolves that.
      verificationStatus: VerificationStatus.VERIFIED,
      status: RecordStatus.ACTIVE,
    });

    return {
      message: 'Registrasi berhasil, silakan login dan pilih Create/Join Organization',
      user: user.toSafeObject(),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Email atau password salah');
    }
    if (user.status !== RecordStatus.ACTIVE) {
      throw new ForbiddenException('Akun tidak aktif, hubungi Admin organisasi Anda');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Email atau password salah');
    }

    // Security gate: an account isn't usable until a Super Admin has
    // approved it — covers both self-registered Sub-Con Supervisors and
    // users created via the invite/join flow (see OrganizationService.join()).
    if (user.verificationStatus === VerificationStatus.PENDING) {
      throw new ForbiddenException('Akun masih menunggu approval Super Admin');
    }
    if (user.verificationStatus === VerificationStatus.REJECTED) {
      throw new ForbiddenException('Akun ditolak oleh Super Admin, hubungi Administrator');
    }

    const role = await this.roleModel.findByPk(user.roleId);
    if (!role) {
      throw new UnauthorizedException('Role user tidak valid');
    }

    await this.usersService.touchLastLogin(user.id);
    return this.createSession(user, role);
  }

  /**
   * Exchanges a still-valid refresh token for a fresh access + refresh pair.
   * The old refresh row is deleted (rotation) and a new one issued, so a
   * replayed/stolen token only works once. Mirrors the shape of login().
   */
  async refresh(refreshToken: string) {
    const stored = await this.refreshTokenModel.findOne({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token tidak valid atau sudah kedaluwarsa');
    }

    const user = await this.usersService.findById(stored.userId);
    if (!user || user.status !== RecordStatus.ACTIVE) {
      throw new UnauthorizedException('Akun tidak valid atau sudah tidak aktif');
    }
    if (user.verificationStatus === VerificationStatus.PENDING) {
      throw new ForbiddenException('Akun masih menunggu approval Super Admin');
    }
    if (user.verificationStatus === VerificationStatus.REJECTED) {
      throw new ForbiddenException('Akun ditolak oleh Super Admin, hubungi Administrator');
    }

    const role = await this.roleModel.findByPk(user.roleId);
    if (!role) {
      throw new UnauthorizedException('Role user tidak valid');
    }

    // Rotation: the presented token is single-use.
    await stored.destroy();

    return this.createSession(user, role);
  }

  /**
   * Revokes a refresh token (rotation on logout) and clears the in-memory
   * session key. Best-effort: the caller logs out locally regardless.
   */
  async logout(refreshToken: string) {
    const stored = await this.refreshTokenModel.findOne({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (stored) {
      await stored.destroy();
      await this.redisService.del(`session:${stored.userId}`);
    }
    return { message: 'Logout berhasil' };
  }

  /**
   * Resolves a registration-link token for the self-register page: returns
   * the owning organization and the active Sub-Con companies under it, so
   * the frontend can populate the registration form. No token/role internals
   * are exposed.
   */
  async resolveRegistrationLink(token: string) {
    const link = await this.registrationLinkModel.findOne({
      where: { token, status: RecordStatus.ACTIVE },
    });
    if (!link) {
      throw new BadRequestException('Registration link tidak valid atau sudah tidak aktif');
    }
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Registration link sudah kedaluwarsa');
    }
    if (link.maxUses !== null && link.useCount >= link.maxUses) {
      throw new BadRequestException('Registration link sudah mencapai batas penggunaan');
    }

    const organization = await this.organizationModel.findByPk(link.organizationId, {
      attributes: ['id', 'name'],
    });
    const subconCompanies = await this.subconCompanyModel.findAll({
      where: { organizationId: link.organizationId, status: RecordStatus.ACTIVE },
      attributes: ['id', 'name'],
      order: [['name', 'ASC']],
    });

    return {
      organization: organization ? { id: organization.id, name: organization.name } : null,
      subconCompanies: subconCompanies.map((c) => ({ id: c.id, name: c.name })),
    };
  }

  /**
   * Builds the full auth response (access + refresh pair, session key, safe
   * user with role). Shared by login() and refresh() so both flows stay in
   * sync.
   */
  private async createSession(user: User, role: Role) {
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      roleId: user.roleId,
      roleCode: role.code as JwtPayload['roleCode'],
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.issueRefreshToken(user.id);

    await this.redisService.set(`session:${user.id}`, accessToken, SESSION_TTL_SECONDS);

    return {
      accessToken,
      refreshToken,
      user: {
        ...user.toSafeObject(),
        role: { id: role.id, code: role.code, name: role.name },
      },
    };
  }
}
