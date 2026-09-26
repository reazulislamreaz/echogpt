import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum NodeEnvironment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  @IsOptional()
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api';

  @IsString()
  @IsOptional()
  API_VERSION: string = '1';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  @IsInt()
  @Min(4)
  @Max(31)
  @IsOptional()
  BCRYPT_SALT_ROUNDS: number = 10;

  @IsInt()
  @Min(1)
  @IsOptional()
  EMAIL_VERIFICATION_EXPIRES_HOURS: number = 24;

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  SMTP_PORT: number = 587;

  @IsBooleanString()
  @IsOptional()
  SMTP_SECURE: string = 'false';

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASS?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM?: string;

  @IsString()
  @IsOptional()
  SMTP_FROM_NAME: string = 'EchoGPT';

  @IsString()
  @IsOptional()
  EMAIL_VERIFICATION_URL?: string;

  @IsBooleanString()
  @IsOptional()
  EMAIL_MOCK: string = 'false';

  @IsBooleanString()
  @IsOptional()
  SWAGGER_ENABLED: string = 'true';

  @IsString()
  @IsOptional()
  SWAGGER_PATH: string = 'docs';

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = '*';

  @IsString()
  @IsNotEmpty()
  ENCRYPTION_KEY!: string;

  @IsBooleanString()
  @IsOptional()
  AI_COMPLETION_MOCK: string = 'false';

  @IsInt()
  @Min(1000)
  @IsOptional()
  AI_REQUEST_TIMEOUT_MS: number = 30000;

  @IsBooleanString()
  @IsOptional()
  WEB_SEARCH_MOCK: string = 'false';

  @IsString()
  @IsOptional()
  WEB_SEARCH_PROVIDER: string = 'serper';

  @IsString()
  @IsOptional()
  WEB_SEARCH_API_KEY?: string;

  @IsString()
  @IsOptional()
  WEB_SEARCH_BASE_URL?: string;

  @IsInt()
  @Min(1000)
  @IsOptional()
  WEB_SEARCH_TIMEOUT_MS: number = 15000;

  @IsInt()
  @Min(1)
  @Max(20)
  @IsOptional()
  WEB_SEARCH_DEFAULT_LIMIT: number = 10;

  @IsInt()
  @Min(0)
  @IsOptional()
  WEB_SEARCH_CACHE_TTL_SECONDS: number = 300;

  @IsBooleanString()
  @IsOptional()
  REQUIRE_EMAIL_VERIFICATION: string = 'false';

  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  REDIS_DB: number = 0;

  @IsString()
  @IsOptional()
  REDIS_KEY_PREFIX: string = 'echogpt:';

  @IsInt()
  @Min(100)
  @IsOptional()
  REDIS_CONNECT_TIMEOUT_MS: number = 2000;

  @IsInt()
  @Min(100)
  @IsOptional()
  REDIS_COMMAND_TIMEOUT_MS: number = 1000;

  @IsInt()
  @Min(1000)
  @IsOptional()
  THROTTLE_TTL_MS: number = 60000;

  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LIMIT: number = 100;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }

  if (!validated.JWT_ACCESS_SECRET && !validated.JWT_SECRET) {
    throw new Error(
      'Environment validation failed: Either JWT_ACCESS_SECRET or JWT_SECRET must be configured',
    );
  }

  const smtpCredentialCount = [
    validated.SMTP_HOST,
    validated.SMTP_USER,
    validated.SMTP_PASS,
    validated.SMTP_FROM,
  ].filter((value) => Boolean(value && String(value).trim())).length;
  const hasVerificationUrl = Boolean(
    validated.EMAIL_VERIFICATION_URL && String(validated.EMAIL_VERIFICATION_URL).trim(),
  );
  // A verification URL by itself does not enable SMTP. Credentials must be complete together.
  if (smtpCredentialCount > 0 && (smtpCredentialCount < 4 || !hasVerificationUrl)) {
    throw new Error(
      'Environment validation failed: Email service configuration is incomplete. Set SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM, and EMAIL_VERIFICATION_URL together.',
    );
  }

  return validated;
}
