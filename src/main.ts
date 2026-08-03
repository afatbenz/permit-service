import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { Sequelize } from 'sequelize-typescript';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { runMigrations } from './database/migrator';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  // Allow the Vite dev server (and any other origin) to call the API from a
  // different port. Tokens are sent via the Authorization header, not
  // cookies, so credentials are optional — enabled anyway for flexibility.
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3000;

  if (configService.get<boolean>('autoMigrateOnBoot')) {
    const sequelize = app.get(Sequelize);
    await runMigrations(sequelize);
  }

  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`E-Permit backend running on http://localhost:${port}/api/v1`);
}

bootstrap();
