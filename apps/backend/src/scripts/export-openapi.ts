import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { AppModule } from '../app.module';
import { buildSwaggerConfig } from '../swagger';

/**
 * Dumps the OpenAPI document to a file (or stdout) without starting the
 * HTTP server. Keeps vendored client specs (e.g. the iOS app's
 * Resources/openapi.json) in sync with the real API:
 *
 *   pnpm --filter backend openapi:export -- /path/to/openapi.json
 */
async function main() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: false,
  });
  app.setGlobalPrefix('api');

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  const json = JSON.stringify(document);

  const outPath = process.argv[2];
  if (outPath) {
    writeFileSync(outPath, json + '\n');
    console.error(`OpenAPI spec written to ${outPath}`);
  } else {
    process.stdout.write(json + '\n');
  }

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
