import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Validate APP_DATA_PATH in production
  const isProduction = process.env.NODE_ENV === 'production';
  const appDataPath = process.env.APP_DATA_PATH;

  if (isProduction && (!appDataPath || appDataPath.trim() === '')) {
    logger.error('APP_DATA_PATH is required in production.');
    logger.error(
      'Set it to a persistent storage location (e.g., APP_DATA_PATH=/data/sav)',
    );
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
