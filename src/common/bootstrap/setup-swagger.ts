import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-error-response.dto';
import { PaginationMetaDto } from '../dto/pagination-meta.dto';

export function setupSwagger(app: INestApplication, configService: ConfigService): void {
  const enabled = configService.get<boolean>('app.swagger.enabled', true);
  if (!enabled) {
    return;
  }

  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const swaggerPath = configService.get<string>('app.swagger.path', 'docs');
  const logger = new Logger('Swagger');

  const config = new DocumentBuilder()
    .setTitle('EchoGPT Backend API')
    .setDescription(
      [
        'REST API for EchoGPT providing authentication, user management, subscriptions,',
        'AI provider management, conversations, AI-powered chat (including SSE streaming),',
        'web search, usage tracking, and administrative analytics.',
        '',
        '**Authentication:** click **Authorize** and paste a JWT access token as `Bearer <token>`.',
        '',
        '**Rate limiting:** global HTTP throttling may return `429 Too Many Requests`.',
        'Subscription plan limits are enforced separately on chat/search endpoints.',
        '',
        '**Optional dependencies:** Redis and SMTP improve caching/email delivery but are not required for core API availability.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token from POST /api/v1/auth/login',
        in: 'header',
      },
      'bearer',
    )
    .addTag('health', 'Application and dependency health probes')
    .addTag('auth', 'Registration, login, tokens, and email verification')
    .addTag('users', 'Authenticated user profile and account management')
    .addTag('subscriptions', 'Plans, current subscription, upgrade/downgrade, and usage status')
    .addTag('providers', 'AI provider discovery and per-user provider configuration')
    .addTag('chat', 'Conversations, messages, and AI streaming')
    .addTag('search', 'Web search and personal search history')
    .addTag('admin', 'Administrator dashboard, users, providers, subscriptions, and analytics')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ApiErrorResponseDto, PaginationMetaDto],
  });

  SwaggerModule.setup(`${apiPrefix}/${swaggerPath}`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'EchoGPT API Docs',
  });

  logger.log(`Swagger docs available at /${apiPrefix}/${swaggerPath}`);
}
