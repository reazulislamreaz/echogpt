import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RoleType } from '../roles/enums/role.enum';
import { calculateNextPeriodEnd } from '../subscriptions/utils/billing-period.util';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { UserWithRole, UsersService } from '../users/users.service';
import {
  AuthTokensDto,
  LoginResponseDto,
  MessageResponseDto,
  RegisterResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { EmailService } from './services/email.service';
import { generateRandomToken, hashToken, parseDurationToMs } from './utils/token.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtAccessSecret: string;
  private readonly jwtAccessExpiresIn: `${number}${'s' | 'm' | 'h' | 'd'}`;
  private readonly jwtRefreshExpiresIn: string;
  private readonly bcryptSaltRounds: number;
  private readonly verificationExpiresHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    const accessSecret = this.configService.get<string>('app.jwt.accessSecret');
    if (!accessSecret) {
      throw new InternalServerErrorException('JWT access secret is not configured');
    }
    this.jwtAccessSecret = accessSecret;
    this.jwtAccessExpiresIn = (this.configService.get<string>('app.jwt.accessExpiresIn') ??
      '15m') as `${number}${'s' | 'm' | 'h' | 'd'}`;
    this.jwtRefreshExpiresIn = this.configService.get<string>('app.jwt.refreshExpiresIn') ?? '7d';
    this.bcryptSaltRounds = this.configService.get<number>('app.auth.bcryptSaltRounds', 10);
    this.verificationExpiresHours = this.configService.get<number>(
      'app.auth.verificationExpiresHours',
      24,
    );
  }

  /**
   * Registers a new user with USER role, hashes password, and creates an email verification token.
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check for existing user with identical email
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email address already exists');
    }

    // Default to USER role (never allow self-assigning ADMIN)
    const userRole = await this.usersService.findRoleByName(RoleType.USER);
    if (!userRole) {
      throw new InternalServerErrorException('Default user role is not configured');
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptSaltRounds);

    // Create single-use verification token
    const rawVerificationToken = generateRandomToken(32);
    const verificationTokenHash = hashToken(rawVerificationToken);
    const verificationExpiresAt = new Date(
      Date.now() + this.verificationExpiresHours * 60 * 60 * 1000,
    );

    let newUser: UserWithRole;
    try {
      newUser = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash,
            firstName: dto.firstName?.trim() || null,
            lastName: dto.lastName?.trim() || null,
            isActive: true,
            isEmailVerified: false,
            roleId: userRole.id,
          },
          include: {
            role: true,
          },
        });

        await tx.emailVerificationToken.create({
          data: {
            userId: createdUser.id,
            tokenHash: verificationTokenHash,
            expiresAt: verificationExpiresAt,
          },
        });

        const freePlan = await tx.subscriptionPlan.findUnique({
          where: { slug: 'free' },
        });

        if (!freePlan) {
          throw new InternalServerErrorException('Default FREE plan is not configured');
        }

        const now = new Date();
        await tx.subscription.create({
          data: {
            userId: createdUser.id,
            planId: freePlan.id,
            status: 'ACTIVE',
            startDate: now,
            currentPeriodStart: now,
            currentPeriodEnd: calculateNextPeriodEnd(now, freePlan.billingCycle),
          },
        });

        return createdUser;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email address already exists');
      }
      throw error;
    }

    let emailDispatched = false;
    try {
      await this.emailService.sendVerificationEmail(
        normalizedEmail,
        rawVerificationToken,
        newUser.firstName,
      );
      emailDispatched = true;
    } catch (error) {
      // Keep registration successful; token remains valid for resend-verification.
      this.logger.error(
        `Verification email dispatch failed after registration for ${normalizedEmail}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return {
      message: emailDispatched
        ? 'User registered successfully. Please check your email to verify your account.'
        : 'User registered successfully. Verification email could not be sent right now. Please use resend-verification.',
      user: this.usersService.toSafeUser(newUser),
    };
  }

  /**
   * Authenticates user with email & password, issuing JWT access token and secure session refresh token.
   */
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string): Promise<LoginResponseDto> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { role: true },
    });

    // Check existence and deleted status with generic error to prevent email enumeration
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check account active status
    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    const requireEmailVerification = this.configService.get<boolean>(
      'app.auth.requireEmailVerification',
      false,
    );
    if (requireEmailVerification && !user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email verification is required before login. Please verify your email address.',
      );
    }

    // Constant-time password comparison
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT access token
    const accessTokenPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role.name,
    };
    const accessToken = this.jwtService.sign(accessTokenPayload, {
      secret: this.jwtAccessSecret,
      expiresIn: this.jwtAccessExpiresIn,
    });

    // Generate secure refresh token
    const rawRefreshToken = generateRandomToken(40);
    const refreshTokenHash = hashToken(rawRefreshToken);
    const refreshExpiresInMs = parseDurationToMs(this.jwtRefreshExpiresIn);
    const refreshExpiresAt = new Date(Date.now() + refreshExpiresInMs);

    // Create session record in database
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash,
        userAgent: userAgent || null,
        ipAddress: ipAddress || null,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      user: this.usersService.toSafeUser(user),
    };
  }

  /**
   * Refreshes access token and rotates refresh token, protecting against token replay.
   */
  async refresh(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokensDto> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const tokenHash = hashToken(refreshToken);

    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: {
        user: {
          include: { role: true },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // If session has already been revoked, token reuse / replay detected
    if (session.revokedAt !== null) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    // If session expired
    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Check user account status
    if (session.user.deletedAt !== null) {
      throw new UnauthorizedException('User account has been deleted');
    }
    if (!session.user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    // Issue new access token
    const newAccessTokenPayload: JwtPayload = {
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role.name,
    };
    const newAccessToken = this.jwtService.sign(newAccessTokenPayload, {
      secret: this.jwtAccessSecret,
      expiresIn: this.jwtAccessExpiresIn,
    });

    // Rotate refresh token: generate new token and hash
    const newRawRefreshToken = generateRandomToken(40);
    const newRefreshTokenHash = hashToken(newRawRefreshToken);
    const refreshExpiresInMs = parseDurationToMs(this.jwtRefreshExpiresIn);
    const newRefreshExpiresAt = new Date(Date.now() + refreshExpiresInMs);

    // In transaction: revoke old session and persist new rotated session
    await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      await tx.session.create({
        data: {
          userId: session.userId,
          refreshTokenHash: newRefreshTokenHash,
          userAgent: userAgent ?? session.userAgent,
          ipAddress: ipAddress ?? session.ipAddress,
          expiresAt: newRefreshExpiresAt,
        },
      });
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Logs out user by revoking the specific session or all active sessions for the user.
   */
  async logout(userId: string, refreshToken?: string): Promise<MessageResponseDto> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await this.prisma.session.updateMany({
        where: {
          userId,
          refreshTokenHash: tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    } else {
      await this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return { message: 'Logged out successfully' };
  }

  /**
   * Retrieves authenticated user details.
   */
  async getCurrentUser(userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('User account does not exist');
    }

    this.usersService.validateAccountStatus(user);

    return this.usersService.toSafeUser(user);
  }

  /**
   * Verifies an account using a single-use, time-bound verification token.
   */
  async verifyEmail(rawToken: string): Promise<MessageResponseDto> {
    if (!rawToken) {
      throw new BadRequestException('Verification token is required');
    }

    const tokenHash = hashToken(rawToken);

    const verificationRecord = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!verificationRecord) {
      throw new BadRequestException('Invalid or expired email verification token');
    }

    if (verificationRecord.usedAt !== null) {
      throw new BadRequestException('Email verification token has already been used');
    }

    if (verificationRecord.expiresAt <= new Date()) {
      throw new BadRequestException('Email verification token has expired');
    }

    if (!verificationRecord.user || verificationRecord.user.deletedAt !== null) {
      throw new BadRequestException('Associated user account does not exist or has been deleted');
    }

    // Mark token used and set User.isEmailVerified = true transactionally
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: verificationRecord.id },
        data: { usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: verificationRecord.userId },
        data: { isEmailVerified: true },
      });
    });

    return { message: 'Email verified successfully' };
  }

  /**
   * Generates and dispatches a new verification token, invalidating prior tokens.
   */
  async resendVerification(email: string): Promise<MessageResponseDto> {
    const genericResponse: MessageResponseDto = {
      message:
        'If an account with this email exists and is unverified, a verification link has been sent.',
    };

    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Guard against account enumeration and skip if already verified or deleted
    if (!user || user.deletedAt !== null || !user.isActive || user.isEmailVerified) {
      return genericResponse;
    }

    const rawToken = generateRandomToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.verificationExpiresHours * 60 * 60 * 1000);

    // Invalidate previous unused tokens and insert new token
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });
    });

    try {
      await this.emailService.sendVerificationEmail(user.email, rawToken, user.firstName);
    } catch (error) {
      // Generic response avoids enumeration; token remains usable once SMTP recovers.
      this.logger.error(
        `Verification email resend failed for ${normalizedEmail}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }

    return genericResponse;
  }
}
