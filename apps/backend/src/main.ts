import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { MetricsService } from './metrics/metrics.service';
import { securityHeaders } from './common/security-headers.middleware';
import { buildSwaggerConfig } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    bufferLogs: true,
  });

  const logger = app.get(Logger);
  app.useLogger(logger);

  // Optional Prometheus instrumentation (METRICS_ENABLED=true). Registered
  // before Nest mounts its routers so every request is timed; a no-op
  // pass-through when disabled.
  app.use(app.get(MetricsService).middleware());

  // Baseline security headers on every response (SECURITY-REVIEW SAV-10)
  app.use(securityHeaders);

  // Validate APP_DATA_PATH in production
  const isProduction = process.env.NODE_ENV === 'production';
  const appDataPath = process.env.APP_DATA_PATH;

  if (isProduction && (!appDataPath || appDataPath.trim() === '')) {
    logger.error('APP_DATA_PATH is required in production.');
    logger.error(
      'Set it to a persistent storage location (e.g., APP_DATA_PATH=/data/bookmark)',
    );
    process.exit(1);
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  // SIGTERM (container stop, restart-after-restore) runs module shutdown
  // hooks — stopping the backup cron job and closing connections — instead of
  // killing the process mid-flight.
  app.enableShutdownHooks();

  // OpenAPI/Swagger setup — config shared with scripts/export-openapi.ts
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  // Expose OpenAPI JSON at /api/docs-json for programmatic access
  app.getHttpAdapter().get('/api/docs-json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(document);
  });

  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Bookmark API Documentation',
    customfavIcon: '/favicon.ico',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  logger.log(`Application listening on port ${port}`, 'Bootstrap');
}
bootstrap();
