import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { BaseRepository } from '../../../common/repositories/base.repository';
import { Organization } from '../../../database/models/organization.model';

@Injectable()
export class OrganizationRepository extends BaseRepository<Organization> {
  constructor(@InjectModel(Organization) organizationModel: typeof Organization) {
    super(organizationModel);
  }

  findByCode(code: string): Promise<Organization | null> {
    return this.model.findOne({ where: { code } });
  }
}
