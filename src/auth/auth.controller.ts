import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import {
  ApiStandardBadRequest,
  ApiStandardConflict,
  ApiStandardInternalError,
  ApiStandardTooManyRequests,
  ApiStandardUnauthorized,
} from '../common/swagger/api-error-responses';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  AuthTokensDto,
  LoginResponseDto,
  MessageResponseDto,
  RegisterResponseDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { LogoutDto } from './dto/logout.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a USER account, hashes the password with bcrypt, and sends an email verification token when SMTP is configured.',
  })
  @ApiCreatedResponse({ type: RegisterResponseDto })
  @ApiStandardBadRequest()
  @ApiStandardConflict('Email address is already in use')
  @ApiStandardTooManyRequests()
  @ApiStandardInternalError()
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Authenticates credentials, issues a JWT access token and opaque refresh token, and creates a session.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiStandardBadRequest()
  @ApiStandardUnauthorized('Invalid credentials or inactive account')
  @ApiStandardTooManyRequests()
  async login(@Body() dto: LoginDto, @Req() req: Request): Promise<LoginResponseDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.authService.login(dto, ipAddress, userAgent);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Validates the refresh token, rotates it, revokes the previous session token, and returns a new JWT pair.',
  })
  @ApiOkResponse({ type: AuthTokensDto })
  @ApiStandardBadRequest()
  @ApiStandardUnauthorized('Invalid, expired, or revoked refresh token')
  @ApiStandardTooManyRequests()
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokensDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.authService.refresh(dto.refreshToken, ipAddress, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out current user',
    description:
      'Revokes the provided refresh token session (or all active sessions when omitted) for the authenticated user.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
  ): Promise<MessageResponseDto> {
    return this.authService.logout(user.id, dto?.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current authenticated user profile',
    description:
      'Returns the safe profile of the authenticated user. Never includes password or token hashes.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.authService.getCurrentUser(user.id);
  }

  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address via link',
    description:
      'Accepts the verification token from the email link query string (`?token=...`). Marks the account verified when valid.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description:
      'Raw verification token from the email link (never log or store client-side long-term)',
    example: 'example-verification-token',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiStandardBadRequest('Invalid, expired, or previously used verification token')
  @ApiStandardTooManyRequests()
  async verifyEmailFromLink(@Query('token') token: string): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(token);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verifies the user email using a single-use token from registration or resend.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiStandardBadRequest('Invalid, expired, or previously used verification token')
  @ApiStandardTooManyRequests()
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend email verification link',
    description:
      'Dispatches a new verification token when an unverified account exists. Always returns a generic confirmation to avoid account enumeration.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiStandardBadRequest()
  @ApiStandardTooManyRequests()
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<MessageResponseDto> {
    return this.authService.resendVerification(dto.email);
  }
}
