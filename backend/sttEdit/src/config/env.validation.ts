import { plainToInstance } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional, validateSync } from 'class-validator';

class EnvironmentVariables {
  // Node Environment
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  // Database Configuration
  @IsNotEmpty({ message: 'POSTGRES_HOST is required' })
  @IsString()
  POSTGRES_HOST: string;

  @IsNotEmpty({ message: 'POSTGRES_PORT is required' })
  @IsString()
  POSTGRES_PORT: string;

  @IsNotEmpty({ message: 'POSTGRES_USERNAME is required' })
  @IsString()
  POSTGRES_USERNAME: string;

  @IsNotEmpty({ message: 'POSTGRES_PASSWORD is required' })
  @IsString()
  POSTGRES_PASSWORD: string;

  @IsNotEmpty({ message: 'POSTGRES_DATABASE is required' })
  @IsString()
  POSTGRES_DATABASE: string;

  // Database Pool & SSL Settings (optional)
  @IsOptional()
  @IsString()
  DB_POOL_SIZE?: string;

  @IsOptional()
  @IsString()
  DB_SSL?: string;

  @IsOptional()
  @IsString()
  DB_SSL_REJECT_UNAUTHORIZED?: string;

  // 사설 CA 인증서 경로. DB_SSL=true + rejectUnauthorized=true면 필수.
  @IsOptional()
  @IsString()
  DB_SSL_CA?: string;

  // Redis Configuration
  @IsOptional()
  @IsString()
  REDIS_MODE?: string;

  @IsOptional()
  @IsString()
  REDIS_HOST?: string;

  @IsOptional()
  @IsString()
  REDIS_CLUSTER_NODES?: string;

  @IsOptional()
  @IsString()
  REDIS_EXTERNAL_HOST?: string;

  @IsOptional()
  @IsString()
  REDIS_PASSWORD?: string;

  // Server Configuration
  @IsOptional()
  @IsString()
  PORT?: string;

  @IsNotEmpty({ message: 'ALLOWED_ORIGINS is required' })
  @IsString()
  ALLOWED_ORIGINS: string;

  // JWT Configuration
  @IsNotEmpty({ message: 'JWT_SECRET is required' })
  @IsString()
  JWT_SECRET: string;
}

export function validate(config: Record<string, unknown>) {
  // First, check for required environment variables explicitly
  const requiredVars = [
    'POSTGRES_HOST',
    'POSTGRES_PORT',
    'POSTGRES_USERNAME',
    'POSTGRES_PASSWORD',
    'POSTGRES_DATABASE',
    'ALLOWED_ORIGINS',
    'JWT_SECRET',
  ];

  const missingVars = requiredVars.filter(
    (varName) => !config[varName] || config[varName] === '',
  );

  if (missingVars.length > 0) {
    const errorMessage = missingVars
      .map((varName) => `  - ${varName} is required`)
      .join('\n');

    throw new Error(
      `\n❌ Environment validation failed:\n\n${errorMessage}\n\n` +
        `Please check your .env file and ensure all required environment variables are set.\n`,
    );
  }

  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints).join(', ')
          : 'Unknown validation error';
        return `  - ${error.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(
      `\n❌ Environment validation failed:\n\n${errorMessages}\n\n` +
        `Please check your .env file and ensure all required environment variables are set.\n`,
    );
  }

  return validatedConfig;
}
