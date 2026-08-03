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
}
