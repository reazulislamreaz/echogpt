import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const port = configService.get<number>('app.port', 3000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const apiVersion = configService.get<string>('app.apiVersion', '1');
  const corsOrigin = configService.get<string>('app.corsOrigin', '*');
  const swaggerEnabled = configService.get<boolean>('app.swagger.enabled', true);
  const swaggerPath = configService.get<string>('app.swagger.path', 'docs');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'development');

  app.setGlobalPrefix(apiPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: apiVersion,
  });

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EchoGPT API')
      .setDescription('REST API backend for the EchoGPT Chrome Extension')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('health')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup(`${apiPrefix}/${swaggerPath}`, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    logger.log(`Swagger docs available at /${apiPrefix}/${swaggerPath}`);
  }

  await app.listen(port);
  logger.log(`EchoGPT API running on http://localhost:${port}/${apiPrefix}/v${apiVersion}`);
  logger.log(`Environment: ${nodeEnv}`);
}

void bootstrap();
