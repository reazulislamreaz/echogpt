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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  ApiStandardBadRequest,
  ApiStandardForbidden,
  ApiStandardNotFound,
  ApiStandardTooManyRequests,
  ApiStandardUnauthorized,
} from '../common/swagger/api-error-responses';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Roles } from '../roles/decorators/roles.decorator';
import { RoleType } from '../roles/enums/role.enum';
import { RolesGuard } from '../roles/guards/roles.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PaginatedUsersDto } from './dto/paginated-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserMessageResponseDto } from './dto/user-message-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the authenticated user profile without passwords, token hashes, or other internal security fields.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async getProfile(@CurrentUser() user: AuthenticatedUser): Promise<UserResponseDto> {
    return this.usersService.getCurrentUserProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates firstName, lastName, and avatarUrl. Identity fields (id, email, password, role) cannot be changed here.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiStandardBadRequest()
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
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
      'Verifies the current password, hashes the new password, updates the account, and revokes active refresh sessions.',
  })
  @ApiOkResponse({ type: UserMessageResponseDto })
  @ApiStandardBadRequest('Current password incorrect, invalid new password, or same as current')
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
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
      'Deactivates the account and revokes active sessions while preserving historical records.',
  })
  @ApiOkResponse({ type: UserMessageResponseDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async deleteAccount(@CurrentUser() user: AuthenticatedUser): Promise<UserMessageResponseDto> {
    return this.usersService.softDeleteAccount(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @ApiOperation({
    summary: 'List users with pagination (Admin only)',
    description:
      'Returns a paginated list of registered users in safe representation. Requires ADMIN role.',
  })
  @ApiOkResponse({ type: PaginatedUsersDto })
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async findAll(@Query() query: PaginationQueryDto): Promise<PaginatedUsersDto> {
    return this.usersService.findAll(query.page, query.limit);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @ApiOperation({
    summary: 'Get user by ID (Admin only)',
    description: 'Retrieves safe user information for a given user ID. Requires ADMIN role.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiStandardNotFound()
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.usersService.toSafeUser(user);
  }
}
