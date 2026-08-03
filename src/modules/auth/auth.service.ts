import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegistrationLink } from '../../database/models/registration-link.model';
import { SubconCompany } from '../../database/models/subcon-company.model';
import { Role } from '../../database/models/role.model';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { RedisService } from '../../redis/redis.service';

const SALT_ROUNDS = 10;
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 1 day, mirrors default JWT expiry

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @InjectModel(RegistrationLink) private readonly registrationLinkModel: typeof RegistrationLink,
    @InjectModel(SubconCompany) private readonly subconCompanyModel: typeof SubconCompany,
    @InjectModel(Role) private readonly roleModel: typeof Role,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  /**
   * Self-register flow, Supervisor Sub-Con only. organizationId/roleId are
   * never taken from the request body — they're resolved from the
   * registration link token, which an Org Admin generated and shared as a
   * URL/QR for their organization (see design doc section on onboarding).
   */
  async register(dto: RegisterDto) {
    const link = await this.registrationLinkModel.findOne({
      where: { token: dto.registrationToken, status: RecordStatus.ACTIVE },
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

    const subcon = await this.subconCompanyModel.findOne({
      where: {
        id: dto.subconCompanyId,
        organizationId: link.organizationId,
        status: RecordStatus.ACTIVE,
      },
    });
    if (!subcon) {
      throw new BadRequestException(
        'Perusahaan Sub-Kontraktor tidak ditemukan pada organisasi pemilik link ini',
      );
    }

    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    return this.sequelize.transaction(async (transaction) => {
      const user = await this.usersService.create(
        {
          organizationId: link.organizationId,
          subconCompanyId: subcon.id,
          roleId: link.defaultRoleId,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
          // Pending until an Org Admin / Supervisor Main-Con verifies the
          // account — see design doc "Onboarding & Role Assignment".
          verificationStatus: VerificationStatus.PENDING,
          status: RecordStatus.ACTIVE,
        },
        { transaction },
      );

      await link.increment('useCount', { by: 1, transaction });

      return {
        message: 'Registrasi berhasil, menunggu verifikasi dari Admin',
        user: user.toSafeObject(),
      };
    });
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

    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      roleId: user.roleId,
      roleCode: role.code as JwtPayload['roleCode'],
    };
    const accessToken = this.jwtService.sign(payload);

    await this.usersService.touchLastLogin(user.id);
    await this.redisService.set(`session:${user.id}`, accessToken, SESSION_TTL_SECONDS);

    return {
      accessToken,
      user: {
        ...user.toSafeObject(),
        role: { id: role.id, code: role.code, name: role.name },
      },
    };
  }
}
