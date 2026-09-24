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
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
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
      'Creates a new user record with USER role, securely hashes password with bcrypt, and sends an email verification token.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'User registered successfully',
    type: RegisterResponseDto,
  })
  @ApiConflictResponse({ description: 'Email address is already in use' })
  @ApiInternalServerErrorResponse({ description: 'Server configuration error' })
  async register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in with email and password',
    description:
      'Authenticates user credentials, generates JWT access token and secure rotated refresh token, and creates a session.',
  })
  @ApiOkResponse({
    description: 'Authentication successful',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials or inactive account' })
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
      'Validates the refresh token hash, rotates the refresh token, revokes the previous token, and issues a new JWT pair.',
  })
  @ApiOkResponse({
    description: 'Tokens successfully refreshed',
    type: AuthTokensDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or revoked refresh token',
  })
  async refresh(@Body() dto: RefreshTokenDto, @Req() req: Request): Promise<AuthTokensDto> {
    const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];

    return this.authService.refresh(dto.refreshToken, ipAddress, userAgent);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log out current user',
    description:
      'Revokes active refresh token sessions for the authenticated user to prevent token replay.',
  })
  @ApiOkResponse({
    description: 'Logged out successfully',
    type: MessageResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication token required' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
  ): Promise<MessageResponseDto> {
    return this.authService.logout(user.id, dto?.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current authenticated user profile',
    description:
      'Returns the safe profile representation of the authenticated user without exposing passwords or tokens.',
  })
  @ApiOkResponse({
    description: 'Current user profile details',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication token required' })
  async getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.authService.getCurrentUser(user.id);
  }

  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address via link',
    description:
      'Accepts the verification token from the email link query string (?token=...). Marks the account verified when the token is valid.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'Raw verification token from the email link',
  })
  @ApiOkResponse({
    description: 'Email successfully verified',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid, expired, or previously used verification token',
  })
  async verifyEmailFromLink(@Query('token') token: string): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(token);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address',
    description:
      'Verifies the user email using a single-use token sent during registration or resend.',
  })
  @ApiOkResponse({
    description: 'Email successfully verified',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid, expired, or previously used verification token',
  })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend email verification link',
    description:
      'Dispatches a new verification token to the provided email address if an unverified account exists.',
  })
  @ApiOkResponse({
    description: 'Generic confirmation message (safeguards against account enumeration)',
    type: MessageResponseDto,
  })
  async resendVerification(@Body() dto: ResendVerificationDto): Promise<MessageResponseDto> {
    return this.authService.resendVerification(dto.email);
  }
}
