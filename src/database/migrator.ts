import * as fs from 'fs';
import { Sequelize } from 'sequelize-typescript';
import { Umzug, SequelizeStorage } from 'umzug';

/**
 * Raw-SQL migration runner. Each file in database/migrations/*.sql is one
 * migration, run once, in filename order (hence the 001_, 002_ prefixes).
 * Applied migrations are tracked in a `schema_migrations` table so re-runs
 * only execute what's new — safe to call on every app boot.
 *
 * Down migrations aren't supported on purpose: rolling back DDL that may
 * already have data in it is rarely something you want done automatically.
 * Write a new forward migration to undo something instead.
 */
export function createMigrator(sequelize: Sequelize) {
  return new Umzug({
    migrations: {
      glob: ['migrations/*.sql', { cwd: __dirname }],
      resolve: ({ name, path: filePath, context }) => ({
        name,
        up: async () => {
          const sql = fs.readFileSync(filePath as string, 'utf8');
          await context.query(sql);
        },
        down: async () => {
          throw new Error(
            `Migration '${name}' has no down migration. Write a new forward migration instead of rolling back raw DDL.`,
          );
        },
      }),
    },
    context: sequelize,
    storage: new SequelizeStorage({ sequelize, tableName: 'schema_migrations' }),
    logger: console,
  });
}

export async function runMigrations(sequelize: Sequelize): Promise<void> {
  const migrator = createMigrator(sequelize);
  const pending = await migrator.pending();

  if (pending.length === 0) {
    console.log('[migrator] Database schema is up to date, no pending migrations.');
    return;
  }

  console.log(
    `[migrator] Running ${pending.length} pending migration(s): ${pending
      .map((m) => m.name)
      .join(', ')}`,
  );
  await migrator.up();
  console.log('[migrator] Done.');
}
