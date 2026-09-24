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
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  auth: {
    bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
    verificationExpiresHours: parseInt(process.env.EMAIL_VERIFICATION_EXPIRES_HOURS ?? '24', 10),
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  ai: {
    mockCompletions: (process.env.AI_COMPLETION_MOCK ?? 'false') === 'true',
    requestTimeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '30000', 10),
  },
  database: {
    url: process.env.DATABASE_URL as string,
  },
}));
