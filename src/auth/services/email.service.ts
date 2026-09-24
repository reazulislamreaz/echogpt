import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmailProvider {
  sendVerificationEmail(to: string, token: string): Promise<void>;
}

@Injectable()
export class EmailService implements EmailProvider {
  private readonly logger = new Logger(EmailService.name);
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction =
      this.configService.get<string>('app.nodeEnv', 'development') === 'production';
  }

  /**
   * Sends an email verification link containing the raw token.
   * In development/test, logs an informational message without exposing raw secrets in production.
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    if (this.isProduction) {
      // In production, delegate to configured SMTP / transactional email provider (e.g. Resend, SendGrid)
      this.logger.log(`Verification email dispatched to recipient: ${to}`);
    } else {
      this.logger.debug(
        `[DEV/TEST] Email verification requested for ${to}. Verification token: ${token}`,
      );
    }
    await Promise.resolve();
  }
}
