import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { User } from '../../../database/models/user.model';
import { Role } from '../../../database/models/role.model';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(@InjectModel(User) userModel: typeof User) {
    super(userModel);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.model.findOne({ where: { email } });
  }

  /** Loads a user with their global role joined in (used by JWT auth). */
  findByIdWithRole(id: string): Promise<User | null> {
    return this.model.findByPk(id, {
      include: [{ model: Role, as: 'role', required: false }],
    });
  }

  touchLastLogin(id: string): Promise<[number]> {
    return this.model.update({ lastLoginAt: new Date() }, { where: { id } });
  }

  /**
   * All active users in an organization, with their role joined in.
   * Used by the Org Admin user-management screen.
   */
  findByOrganizationWithRole(organizationId: string): Promise<User[]> {
    return this.model.findAll({
      where: { organizationId },
      include: [{ model: Role, as: 'role', required: false }],
      order: [['createdAt', 'ASC']],
    });
  }
}
