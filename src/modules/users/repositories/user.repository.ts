import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { User } from '../../../database/models/user.model';

@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(@InjectModel(User) userModel: typeof User) {
    super(userModel);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.model.findOne({ where: { email } });
  }

  touchLastLogin(id: string): Promise<[number]> {
    return this.model.update({ lastLoginAt: new Date() }, { where: { id } });
  }
}
