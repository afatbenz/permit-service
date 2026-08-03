export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    name: process.env.DB_NAME,
  },

  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },

  // Auto-run pending SQL migrations on app boot. Convenient for dev/single
  // instance deployments. For multi-instance production deployments,
  // prefer setting this to 'false' and running `npm run migrate` as a
  // separate CI/CD or Docker entrypoint step, so N instances booting at
  // once don't all race to apply migrations simultaneously.
  autoMigrateOnBoot: process.env.AUTO_MIGRATE_ON_BOOT !== 'false',
});
