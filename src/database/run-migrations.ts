/**
 * Standalone migration runner — doesn't boot the full Nest app, just
 * connects and applies pending SQL migrations. Useful for CI/CD pipelines
 * or a Docker entrypoint step that should run BEFORE the app starts,
 * separately from `AUTO_MIGRATE_ON_BOOT` (see main.ts).
 *
 * Usage: npm run migrate
 */
import 'dotenv/config';
import { Sequelize } from 'sequelize-typescript';
import { runMigrations } from './migrator';

async function main() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    logging: false,
  });

  await sequelize.authenticate();
  await runMigrations(sequelize);
  await sequelize.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] Failed:', err);
    process.exit(1);
  });
