import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { OrganizationRepository } from './repositories/organization.repository';
import { UsersService } from '../users/users.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteOrganizationDto } from './dto/invite-organization.dto';
import { JoinOrganizationDto } from './dto/join-organization.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { Role } from '../../database/models/role.model';
import { OrganizationInvite } from '../../database/models/organization-invite.model';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { InviteStatus } from '../../common/enums/invite-status.enum';
import { RoleCode } from '../../common/enums/role-code.enum';
import { generateOrganizationCode } from '../../common/utils/organization-code.util';

const SALT_ROUNDS = 10;
const INVITE_TOKEN_BYTES = 32;
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CODE_GENERATION_ATTEMPTS = 5;

@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly usersService: UsersService,
    @InjectModel(Role) private readonly roleModel: typeof Role,
    @InjectModel(OrganizationInvite) private readonly inviteModel: typeof OrganizationInvite,
    @InjectConnection() private readonly sequelize: Sequelize,
  ) {}

  /**
   * Super Admin only (enforced at controller level via @Roles). Creates the
   * Organization tenant and its first Org Admin user in a single
   * transaction — a tenant is never left without an admin to manage it.
   *
   * organization.code is auto-generated from organizationName: 5 consonant
   * letters + 3 random digits (e.g. "PT. Jaya Obayashi" -> "JYBYS482"),
   * retried on collision.
   */
  /**
   * Creates an Organization and assigns its first admin.
   *
   * Two entry points share this method:
   * - Onboarding: an authenticated account in the 'unassigned' pre-org state
   *   creates their organization and is promoted to org_admin of it (their
   *   own row is updated in place — no duplicate admin user).
   * - Super Admin (legacy): creates the org plus a fresh org_admin user.
   */
  async createOrganization(dto: CreateOrganizationDto, createdBy: string) {
    const creator = await this.usersService.findById(createdBy);
    if (!creator) {
      throw new BadRequestException('User tidak ditemukan');
    }

    const creatorRole = await this.roleModel.findByPk(creator.roleId);
    const isOnboarding = creatorRole?.code === 'unassigned';
    const isSuperAdmin = creatorRole?.code === RoleCode.SUPER_ADMIN;

    // Only 'unassigned' (onboarding) and 'super_admin' (legacy) may create a
    // new organization. Anyone else already belongs to a tenant.
    if (!isOnboarding && !isSuperAdmin) {
      throw new ForbiddenException(
        'Anda sudah memiliki organisasi. Tidak bisa membuat organisasi baru.',
      );
    }

    if (isOnboarding) {
      // The caller's own email is used as the org admin — they can't
      // self-register then claim to be someone else's admin.
      if (dto.adminEmail.toLowerCase() !== creator.email.toLowerCase()) {
        throw new ForbiddenException('Email admin harus sama dengan akun Anda saat onboarding');
      }
    } else {
      const existingEmail = await this.usersService.findByEmail(dto.adminEmail);
      if (existingEmail) {
        throw new ConflictException('Email admin sudah terdaftar');
      }
    }

    const orgAdminRole = await this.roleModel.findOne({ where: { code: RoleCode.ORG_ADMIN } });
    if (!orgAdminRole) {
      // Should never happen if the role seeder has run — see database/seeders/role.seeder.ts
      throw new InternalServerErrorException('Role org_admin belum ter-seed di database');
    }

    const code = await this.generateUniqueOrganizationCode(dto.organizationName);
    const passwordHash = await bcrypt.hash(dto.adminPassword, SALT_ROUNDS);

    return this.sequelize.transaction(async (transaction) => {
      const organization = await this.organizationRepository.create(
        {
          name: dto.organizationName,
          code,
          createdBy,
        },
        { transaction },
      );

      if (isOnboarding) {
        // Promote the existing account to org_admin of its new org.
        await this.usersService.updateOrganizationAndRole(
          createdBy,
          organization.id,
          orgAdminRole.id,
          { transaction },
        );

        const promoted = await this.usersService.findById(createdBy);
        return {
          organization: organization.toJSON(),
          admin: promoted ? promoted.toSafeObject() : null,
          promoted: true,
        };
      }

      // Legacy Super Admin path: create a fresh org_admin user.
      const admin = await this.usersService.create(
        {
          organizationId: organization.id,
          roleId: orgAdminRole.id,
          name: dto.adminName,
          email: dto.adminEmail,
          phone: dto.adminPhone,
          passwordHash,
          verificationStatus: VerificationStatus.VERIFIED,
          status: RecordStatus.ACTIVE,
          createdBy,
        },
        { transaction },
      );

      return {
        organization: organization.toJSON(),
        admin: admin.toSafeObject(),
        promoted: false,
      };
    });
  }

  /**
   * Generates an organization code and retries on collision. The letters
   * portion is deterministic (derived from the name), so only the random
   * digit suffix changes between attempts.
   */
  private async generateUniqueOrganizationCode(organizationName: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const code = generateOrganizationCode(organizationName);
      const existing = await this.organizationRepository.findByCode(code);
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException(
      'Gagal membuat kode organization yang unik, silakan coba lagi',
    );
  }

  /**
   * Org Admin (own org only) or Super Admin invites a user by email into a
   * specific role. No account is created yet — only an invite record with
   * a token. Actual account creation happens in join() once the invitee
   * accepts. Email delivery is intentionally out of scope here: wire this
   * up to a mail provider/queue in production and stop returning the raw
   * token in the response.
   */
  async invite(organizationId: string, dto: InviteOrganizationDto, invitedBy: string) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }

    const role = await this.roleModel.findOne({ where: { code: dto.roleCode } });
    if (!role) {
      throw new BadRequestException('Role tidak valid');
    }

    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar sebagai user');
    }

    const existingInvite = await this.inviteModel.findOne({
      where: { organizationId, email: dto.email, status: InviteStatus.PENDING },
    });
    if (existingInvite) {
      throw new ConflictException('Invite untuk email ini masih pending, tunggu sampai kedaluwarsa atau dipakai');
    }

    const token = randomBytes(INVITE_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);

    const invite = await this.inviteModel.create({
      organizationId,
      projectId: dto.projectId ?? null,
      email: dto.email,
      roleId: role.id,
      token,
      status: InviteStatus.PENDING,
      expiresAt,
      createdBy: invitedBy,
    });

    return {
      message: 'Invite berhasil dibuat. Kirimkan joinToken ini ke user via email/undangan.',
      inviteId: invite.id,
      email: invite.email,
      roleCode: role.code,
      joinToken: invite.token,
      expiresAt: invite.expiresAt,
    };
  }

  /**
   * Public endpoint — invitee completes their account using the token they
   * received. Even though an Org Admin/Super Admin already chose the email
   * + role at invite time, the resulting account still starts as
   * verification_status='pending' — a Super Admin must explicitly approve
   * it (see approveJoinedUser()) before the account can log in. This is a
   * deliberate extra security gate: a compromised Org Admin invite alone
   * should not be enough to activate a privileged account.
   */
  async join(dto: JoinOrganizationDto) {
    const invite = await this.inviteModel.findOne({ where: { token: dto.inviteToken } });
    if (!invite) {
      throw new BadRequestException('Invite token tidak valid');
    }
    if (invite.status !== InviteStatus.PENDING) {
      throw new BadRequestException('Invite sudah digunakan, dicabut, atau kedaluwarsa');
    }
    if (invite.expiresAt.getTime() < Date.now()) {
      await invite.update({ status: InviteStatus.EXPIRED });
      throw new BadRequestException('Invite sudah kedaluwarsa');
    }

    const existingUser = await this.usersService.findByEmail(invite.email);
    if (existingUser) {
      throw new ConflictException('Email pada invite ini sudah memiliki akun');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    return this.sequelize.transaction(async (transaction) => {
      const user = await this.usersService.create(
        {
          organizationId: invite.organizationId,
          roleId: invite.roleId,
          name: dto.name,
          email: invite.email,
          phone: dto.phone,
          passwordHash,
          // Pending until Super Admin approves — see approveJoinedUser().
          verificationStatus: VerificationStatus.PENDING,
          status: RecordStatus.ACTIVE,
        },
        { transaction },
      );

      await invite.update(
        { status: InviteStatus.ACCEPTED, acceptedAt: new Date() },
        { transaction },
      );

      return {
        message: 'Akun berhasil dibuat, menunggu approval Super Admin sebelum bisa login',
        user: user.toSafeObject(),
      };
    });
  }

  /**
   * Super Admin only. Approves a user stuck in verification_status='pending'
   * — covers both self-registered Sub-Con Supervisors and users who just
   * completed the invite/join flow above.
   */
  async approveUser(userId: string, approvedBy: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.verificationStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        `User ini berstatus '${user.verificationStatus}', bukan 'pending'`,
      );
    }

    await this.usersService.updateVerification(userId, VerificationStatus.VERIFIED, approvedBy);

    return { message: 'User berhasil di-approve', userId };
  }

  /**
   * Super Admin only. Rejects a user stuck in verification_status='pending'.
   */
  async rejectUser(userId: string, rejectedBy: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.verificationStatus !== VerificationStatus.PENDING) {
      throw new BadRequestException(
        `User ini berstatus '${user.verificationStatus}', bukan 'pending'`,
      );
    }

    await this.usersService.updateVerification(userId, VerificationStatus.REJECTED, rejectedBy);

    return { message: 'User ditolak', userId };
  }

  /**
   * Org Admin (own org only) / Super Admin: list every user in an
   * organization with their role, for the user-management screen.
   */
  async listUsers(organizationId: string) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }

    const users = await this.usersService.listByOrganizationWithRole(organizationId);

    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        roleId: u.roleId,
        roleCode: u.role?.code ?? null,
        roleName: u.role?.name ?? null,
        verificationStatus: u.verificationStatus,
        status: u.status,
        createdAt: u.createdAt,
      })),
    };
  }

  /**
   * Org Admin (own org only) / Super Admin: reassign a user's role inside an
   * organization. Guards:
   * - target user must belong to the same org (cross-tenant denied)
   * - role must exist and be an org-assignable role (not super_admin, not
   *   the pre-onboarding 'unassigned' placeholder)
   * - an admin can't demote themselves (prevents locking the org out)
   */
  async updateUserRole(
    organizationId: string,
    userId: string,
    dto: UpdateUserRoleDto,
    actorId: string,
  ) {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organization tidak ditemukan');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User tidak ditemukan');
    }
    if (user.organizationId !== organizationId) {
      throw new ForbiddenException('User tidak berada pada organization ini');
    }
    if (userId === actorId) {
      throw new BadRequestException('Tidak bisa mengubah role akun Anda sendiri');
    }

    const role = await this.roleModel.findByPk(dto.roleId);
    if (!role) {
      throw new BadRequestException('Role tidak ditemukan');
    }
    if (role.code === RoleCode.SUPER_ADMIN || role.code === RoleCode.UNASSIGNED) {
      throw new ForbiddenException(`Role '${role.code}' tidak bisa di-assign oleh admin organization`);
    }

    await this.usersService.updateOrganizationAndRole(userId, organizationId, role.id);

    return {
      message: `Role user ${user.name} diubah menjadi ${role.name}`,
      userId,
      role: { id: role.id, code: role.code, name: role.name },
    };
  }
}
