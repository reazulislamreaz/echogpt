import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, configService: ConfigService): void {
  const enabled = configService.get<boolean>('app.swagger.enabled', true);
  if (!enabled) {
    return;
  }

  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const swaggerPath = configService.get<string>('app.swagger.path', 'docs');
  const logger = new Logger('Swagger');

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('EchoGPT API')
      .setDescription('REST API backend for the EchoGPT Chrome Extension')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('health')
      .addTag('auth')
      .addTag('users')
      .addTag('subscriptions')
      .addTag('providers')
      .addTag('chat')
      .addTag('search')
      .addTag('admin')
      .build(),
  );

  SwaggerModule.setup(`${apiPrefix}/${swaggerPath}`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  logger.log(`Swagger docs available at /${apiPrefix}/${swaggerPath}`);
}
