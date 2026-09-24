import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../roles/decorators/roles.decorator';
import { RoleType } from '../roles/enums/role.enum';
import { RolesGuard } from '../roles/guards/roles.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserMessageResponseDto } from './dto/user-message-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Retrieves the authenticated user profile in a safe format without exposing passwords, token hashes, or internal fields.',
  })
  @ApiOkResponse({
    description: 'Current user profile details',
    type: UserResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.getCurrentUserProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates profile details (firstName, lastName, avatarUrl). Security fields (id, email, password, role) cannot be altered.',
  })
  @ApiOkResponse({
    description: 'Updated user profile',
    type: UserResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input or unallowed fields' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Change account password',
    description:
      'Verifies the current password, validates and hashes the new password, updates database, and revokes active sessions.',
  })
  @ApiOkResponse({
    description: 'Password changed successfully',
    type: UserMessageResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Current password incorrect, invalid new password, or same password',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<UserMessageResponseDto> {
    return this.usersService.changePassword(user.id, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Soft-delete current user account',
    description:
      'Deactivates the account and revokes active sessions while preserving historical data and integrity.',
  })
  @ApiOkResponse({
    description: 'Account successfully deleted',
    type: UserMessageResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async deleteAccount(@CurrentUser() user: AuthenticatedUser): Promise<UserMessageResponseDto> {
    return this.usersService.softDeleteAccount(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @ApiOperation({
    summary: 'List all users (Admin only)',
    description:
      'Returns a list of all registered users in safe representation. Requires ADMIN role.',
  })
  @ApiOkResponse({
    description: 'List of all users',
    type: [UserResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async findAll(): Promise<UserResponseDto[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieves safe user information for a given user ID.',
  })
  @ApiOkResponse({
    description: 'User details',
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.usersService.toSafeUser(user);
  }
}
