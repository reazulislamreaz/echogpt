import 'reflect-metadata';
import { validateEnv } from './env.validation';

const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/echogpt',
  JWT_ACCESS_SECRET: 'test-access-secret',
  ENCRYPTION_KEY: 'test-encryption-key',
};

describe('validateEnv', () => {
  it('accepts a verification URL when SMTP credentials are unset', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        EMAIL_VERIFICATION_URL: 'http://localhost:3000/api/v1/auth/verify-email',
      }),
    ).not.toThrow();
  });

  it('rejects a partial SMTP configuration', () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        SMTP_HOST: 'smtp.example.com',
      }),
    ).toThrow(/Email service configuration is incomplete/);
  });
});
