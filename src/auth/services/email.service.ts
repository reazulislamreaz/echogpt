import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly nodeEnv: string;
  private readonly verificationExpiresHours: number;
  private transporter: Transporter | null = null;
  private readonly smtpConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.nodeEnv = this.configService.get<string>('app.nodeEnv', 'development');
    this.verificationExpiresHours = this.configService.get<number>(
      'app.auth.verificationExpiresHours',
      24,
    );

    const host = this.configService.get<string>('app.smtp.host');
    const user = this.configService.get<string>('app.smtp.user');
    const pass = this.configService.get<string>('app.smtp.pass');
    const from = this.configService.get<string>('app.smtp.from');
    const verificationUrl = this.configService.get<string>('app.smtp.verificationUrl');

    this.smtpConfigured = Boolean(host && user && pass && from && verificationUrl);

    if (this.smtpConfigured) {
      const port = this.configService.get<number>('app.smtp.port', 587);
      const secure = this.configService.get<boolean>('app.smtp.secure', port === 465);

      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
    } else {
      this.logger.warn(
        'SMTP is not configured. Verification emails will fail until SMTP_* and EMAIL_VERIFICATION_URL are set.',
      );
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
    this.transporter = null;
  }

  isSmtpConfigured(): boolean {
    return this.smtpConfigured;
  }

  async verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.transporter || !this.smtpConfigured) {
      throw new ServiceUnavailableException('Email service configuration is incomplete.');
    }

    try {
      await this.transporter.verify();
      return { ok: true, message: 'SMTP connection verified successfully' };
    } catch (error) {
      this.logger.error(
        `SMTP verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException('Failed to verify email service connection.');
    }
  }

  /**
   * Sends a verification email. The raw token is used only to build the URL and is never logged.
   */
  async sendVerificationEmail(
    to: string,
    rawToken: string,
    firstName?: string | null,
  ): Promise<void> {
    const emailMock = this.configService.get<boolean>('app.smtp.mock', false);
    if (this.nodeEnv === 'test' || emailMock) {
      this.logger.debug(`[TEST] Verification email skipped for recipient: ${to}`);
      return;
    }

    if (!this.smtpConfigured || !this.transporter) {
      this.logger.error(`Cannot send verification email to ${to}: SMTP is not configured.`);
      throw new ServiceUnavailableException('Email service configuration is incomplete.');
    }

    const verificationBaseUrl = this.configService.get<string>('app.smtp.verificationUrl')!;
    const fromAddress = this.configService.get<string>('app.smtp.from')!;
    const fromName = this.configService.get<string>('app.smtp.fromName', 'EchoGPT');
    const verificationUrl = this.buildVerificationUrl(verificationBaseUrl, rawToken);
    const displayName = firstName?.trim() || 'there';

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to,
        subject: 'Verify your EchoGPT account',
        text: this.buildPlainTextEmail(displayName, verificationUrl),
        html: this.buildHtmlEmail(displayName, verificationUrl),
      });
      this.logger.log(`Verification email dispatched to recipient: ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${to}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new ServiceUnavailableException('Failed to send verification email.');
    }
  }

  buildVerificationUrl(baseUrl: string, rawToken: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    const separator = trimmed.includes('?') ? '&' : '?';
    return `${trimmed}${separator}token=${encodeURIComponent(rawToken)}`;
  }

  private buildPlainTextEmail(displayName: string, verificationUrl: string): string {
    return [
      `Hello ${displayName},`,
      '',
      'Welcome to EchoGPT.',
      '',
      'Please verify your email address by opening the link below:',
      verificationUrl,
      '',
      `This verification link will expire in ${this.verificationExpiresHours} hour(s).`,
      '',
      'If you did not create this account, you can safely ignore this email.',
      '',
      'Regards,',
      'EchoGPT Team',
    ].join('\n');
  }

  private buildHtmlEmail(displayName: string, verificationUrl: string): string {
    const safeUrl = this.escapeHtml(verificationUrl);
    const safeName = this.escapeHtml(displayName);

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Verify your EchoGPT account</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:22px;color:#111827;">EchoGPT</h1>
          <p style="margin:0 0 12px;font-size:16px;">Hello ${safeName},</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.5;">Welcome to EchoGPT. Please verify your email address to continue.</p>
          <p style="margin:24px 0;" align="center">
            <a href="${safeUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">Verify Email</a>
          </p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#4b5563;">If the button does not work, copy and paste this URL into your browser:</p>
          <p style="margin:0 0 16px;font-size:13px;word-break:break-all;color:#2563eb;">${safeUrl}</p>
          <p style="margin:0 0 12px;font-size:13px;color:#6b7280;">This verification link will expire in ${this.verificationExpiresHours} hour(s).</p>
          <p style="margin:0;font-size:13px;color:#6b7280;">If you did not create this account, you can safely ignore this email.</p>
          <p style="margin:24px 0 0;font-size:14px;">Regards,<br />EchoGPT Team</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
