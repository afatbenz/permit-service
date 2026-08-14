import { Injectable } from '@nestjs/common';
import { CreateOptions } from 'sequelize';
import { UserRepository } from './repositories/user.repository';
import { User } from '../../database/models/user.model';
import { VerificationStatus } from '../../common/enums/verification-status.enum';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) {}

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  /** Loads a user with their global role joined in (used by JWT auth). */
  findByIdWithRole(id: string): Promise<User | null> {
    return this.userRepository.findByIdWithRole(id);
  }

  create(data: Record<string, unknown>, options?: CreateOptions): Promise<User> {
    return this.userRepository.create(data, options);
  }

  touchLastLogin(id: string): Promise<[number]> {
    return this.userRepository.touchLastLogin(id);
  }

  updateVerification(
    id: string,
    verificationStatus: VerificationStatus,
    verifiedBy: string,
  ): Promise<[number]> {
    return this.userRepository.updateById(id, {
      verificationStatus,
      verifiedBy,
      verifiedAt: new Date(),
    });
  }

  /**
   * Onboarding helper: moves an 'unassigned' account into a real org and a
   * concrete role (e.g. org_admin) when they create their organization.
   */
  updateOrganizationAndRole(
    id: string,
    organizationId: string,
    roleId: string,
    options?: CreateOptions,
  ): Promise<[number]> {
    return this.userRepository.updateById(
      id,
      { organizationId, roleId },
      options,
    );
  }

  /** All users in an org with their role joined — for Org Admin management. */
  listByOrganizationWithRole(organizationId: string): Promise<User[]> {
    return this.userRepository.findByOrganizationWithRole(organizationId);
  }

  /**
   * Updates basic profile fields (name/email/phone) for a user. Email is
   * globally unique, so a duplicate target email fails the constraint.
   */
  updateProfileFields(
    id: string,
    data: Partial<Pick<User, 'name' | 'email' | 'phone'>>,
    options?: CreateOptions,
  ): Promise<[number]> {
    return this.userRepository.updateById(id, data, options);
  }
}
