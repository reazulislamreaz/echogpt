import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { applySecurityHeaders } from './common/bootstrap/security-headers';
import { setupSwagger } from './common/bootstrap/setup-swagger';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = configService.get<number>('app.port', 3000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const apiVersion = configService.get<string>('app.apiVersion', '1');
  const corsOrigin = configService.get<string>('app.corsOrigin', '*');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  app.use(applySecurityHeaders);
  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion,
  });
  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  setupSwagger(app, configService);

  await app.listen(port);
  logger.log(`EchoGPT API running on http://localhost:${port}/${apiPrefix}/v${apiVersion}`);
  logger.log(`Environment: ${nodeEnv}`);
}

void bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    `Failed to start EchoGPT API: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exit(1);
});
