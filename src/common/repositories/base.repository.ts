import { Model, ModelCtor } from 'sequelize-typescript';
import { CreateOptions, FindOptions, UpdateOptions } from 'sequelize';

/**
 * Generic repository wrapping a Sequelize model.
 *
 * Services should depend on a concrete repository (e.g. UserRepository),
 * never on `@InjectModel` directly — this keeps Sequelize-specific query
 * details out of business logic and makes it swappable/testable.
 */
export abstract class BaseRepository<T extends Model> {
  protected constructor(protected readonly model: ModelCtor<T>) {}

  findById(id: string, options?: FindOptions): Promise<T | null> {
    return this.model.findByPk(id, options);
  }

  findOne(options: FindOptions): Promise<T | null> {
    return this.model.findOne(options);
  }

  findAll(options?: FindOptions): Promise<T[]> {
    return this.model.findAll(options);
  }

  create(data: Record<string, unknown>, options?: CreateOptions): Promise<T> {
    return this.model.create(data as any, options);
  }

  async updateById(
    id: string,
    data: Record<string, unknown>,
    options?: Omit<UpdateOptions, 'where'>,
  ): Promise<[affectedCount: number]> {
    return this.model.update(data, { ...options, where: { id } as any });
  }
}
