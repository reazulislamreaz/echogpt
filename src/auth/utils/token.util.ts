import * as crypto from 'crypto';

/**
 * Computes a SHA-256 hash for a raw token.
 * Used for storing and looking up refresh tokens and email verification tokens safely.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generates a cryptographically secure random token string.
 */
export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Parses time duration strings (e.g. '15m', '1h', '7d', '24h') to milliseconds.
 * Defaults to 7 days if unrecognized.
 */
export function parseDurationToMs(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}
