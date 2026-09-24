import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

const sendMail = jest.fn();
const verify = jest.fn();
const close = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail,
    verify,
    close,
  })),
}));

describe('EmailService', () => {
  const smtpConfig: Record<string, unknown> = {
    'app.nodeEnv': 'development',
    'app.auth.verificationExpiresHours': 24,
    'app.smtp.host': 'smtp.example.com',
    'app.smtp.port': 587,
    'app.smtp.secure': false,
    'app.smtp.user': 'user@example.com',
    'app.smtp.pass': 'smtp-password',
    'app.smtp.from': 'noreply@example.com',
    'app.smtp.fromName': 'EchoGPT',
    'app.smtp.verificationUrl': 'http://localhost:3000/api/v1/auth/verify-email',
  };

  const createService = async (overrides: Record<string, unknown> = {}) => {
    const configMap = { ...smtpConfig, ...overrides };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              key in configMap ? configMap[key] : fallback,
            ),
          },
        },
      ],
    }).compile();

    return module.get(EmailService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: 'msg-1' });
    verify.mockResolvedValue(true);
  });

  it('builds a verification URL without logging the token', async () => {
    const service = await createService();
    const url = service.buildVerificationUrl(
      'http://localhost:3000/api/v1/auth/verify-email',
      'raw-token-value',
    );
    expect(url).toBe('http://localhost:3000/api/v1/auth/verify-email?token=raw-token-value');
  });

  it('sends a verification email with HTML and plain-text content', async () => {
    const service = await createService();
    await service.sendVerificationEmail('new@example.com', 'raw-token-value', 'Ada');

    expect(sendMail).toHaveBeenCalledTimes(1);
    const payload = sendMail.mock.calls[0][0];
    expect(payload.to).toBe('new@example.com');
    expect(payload.subject).toBe('Verify your EchoGPT account');
    expect(payload.text).toContain('Hello Ada');
    expect(payload.text).toContain('token=raw-token-value');
    expect(payload.html).toContain('Verify Email');
    expect(payload.html).toContain('token=raw-token-value');
    expect(JSON.stringify(payload.from)).not.toContain('smtp-password');
  });

  it('throws a safe error when SMTP send fails', async () => {
    sendMail.mockRejectedValue(new Error('connection refused'));
    const service = await createService();

    await expect(
      service.sendVerificationEmail('new@example.com', 'raw-token-value', 'Ada'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('skips sending when EMAIL_MOCK is enabled', async () => {
    const service = await createService({
      'app.smtp.mock': true,
    });

    await expect(
      service.sendVerificationEmail('new@example.com', 'raw-token-value'),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('skips sending in test env even when SMTP is configured', async () => {
    const service = await createService({
      'app.nodeEnv': 'test',
    });

    await expect(
      service.sendVerificationEmail('new@example.com', 'raw-token-value'),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('throws when SMTP configuration is incomplete outside test env', async () => {
    const service = await createService({
      'app.smtp.host': undefined,
      'app.smtp.user': undefined,
      'app.smtp.pass': undefined,
      'app.smtp.from': undefined,
      'app.smtp.verificationUrl': undefined,
    });

    await expect(
      service.sendVerificationEmail('new@example.com', 'raw-token-value'),
    ).rejects.toThrow('Email service configuration is incomplete.');
  });

  it('skips sending in test env when SMTP is not configured', async () => {
    const service = await createService({
      'app.nodeEnv': 'test',
      'app.smtp.host': undefined,
      'app.smtp.user': undefined,
      'app.smtp.pass': undefined,
      'app.smtp.from': undefined,
      'app.smtp.verificationUrl': undefined,
    });

    await expect(
      service.sendVerificationEmail('new@example.com', 'raw-token-value'),
    ).resolves.toBeUndefined();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('verifies SMTP connection when configured', async () => {
    const service = await createService();
    const result = await service.verifySmtpConnection();
    expect(result.ok).toBe(true);
    expect(verify).toHaveBeenCalled();
  });
});
