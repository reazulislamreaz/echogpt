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
  JWT_REFRESH_SECRET?: string;

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

  return validated;
}
