import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api',
  apiVersion: process.env.API_VERSION ?? '1',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  swagger: {
    enabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
    path: process.env.SWAGGER_PATH ?? 'docs',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  auth: {
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
    verificationExpiresHours: parseInt(process.env.EMAIL_VERIFICATION_EXPIRES_HOURS ?? '24', 10),
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
    fromName: process.env.SMTP_FROM_NAME ?? 'EchoGPT',
    verificationUrl: process.env.EMAIL_VERIFICATION_URL,
    mock: (process.env.EMAIL_MOCK ?? 'false') === 'true',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  ai: {
    mockCompletions: (process.env.AI_COMPLETION_MOCK ?? 'false') === 'true',
    requestTimeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '30000', 10),
  },
  webSearch: {
    mock: (process.env.WEB_SEARCH_MOCK ?? 'false') === 'true',
    provider: process.env.WEB_SEARCH_PROVIDER ?? 'serper',
    apiKey: process.env.WEB_SEARCH_API_KEY,
    baseUrl: process.env.WEB_SEARCH_BASE_URL,
    requestTimeoutMs: parseInt(process.env.WEB_SEARCH_TIMEOUT_MS ?? '15000', 10),
    defaultLimit: parseInt(process.env.WEB_SEARCH_DEFAULT_LIMIT ?? '10', 10),
  },
  database: {
    url: process.env.DATABASE_URL as string,
  },
}));
