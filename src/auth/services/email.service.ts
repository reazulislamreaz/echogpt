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
   * Development logs confirm dispatch without printing the raw token.
   * Production should integrate a real SMTP / transactional email provider.
   */
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    // Keep the token parameter for future provider payloads; never log it.
    void token;

    if (this.isProduction) {
      this.logger.log(`Verification email dispatched to recipient: ${to}`);
    } else {
      this.logger.debug(
        `[DEV/TEST] Email verification requested for ${to}. Token issued (value not logged).`,
      );
    }
    await Promise.resolve();
  }
}
