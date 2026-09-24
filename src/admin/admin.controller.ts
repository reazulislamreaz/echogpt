import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  ApiStandardBadRequest,
  ApiStandardConflict,
  ApiStandardForbidden,
  ApiStandardNotFound,
  ApiStandardTooManyRequests,
  ApiStandardUnauthorized,
} from '../common/swagger/api-error-responses';
import { Roles } from '../roles/decorators/roles.decorator';
import { RoleType } from '../roles/enums/role.enum';
import { RolesGuard } from '../roles/guards/roles.guard';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AdminService } from './admin.service';
import {
  AdminDashboardStatsDto,
  AdminSystemHealthDto,
  AdminUsageAnalyticsDto,
  PaginatedAdminUsageLogsDto,
} from './dto/admin-dashboard.dto';
import { AdminUserSubscriptionDto } from './dto/admin-subscription-response.dto';
import { AdminUpdateUserRoleDto } from './dto/admin-update-user-role.dto';
import { AdminUpdateUserStatusDto } from './dto/admin-update-user-status.dto';
import { AdminUsageAnalyticsQueryDto, AdminUsageLogsQueryDto } from './dto/admin-usage-query.dto';
import {
  AdminUserDetailDto,
  AdminUserUsageSummaryDto,
  PaginatedAdminUsersDto,
} from './dto/admin-user-detail.dto';
import { AdminUserQueryDto } from './dto/admin-user-query.dto';

@ApiTags('admin')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Admin dashboard statistics',
    description:
      'Returns nested aggregate statistics for users, subscriptions, providers, usage, chat, search, and system health.',
  })
  @ApiOkResponse({ type: AdminDashboardStatsDto })
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async dashboard(): Promise<AdminDashboardStatsDto> {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  @ApiOperation({
    summary: 'List users with search and filters',
    description:
      'Paginated admin user list with search, role, active, verification, and date filters. Never returns password or token hashes.',
  })
  @ApiOkResponse({ type: PaginatedAdminUsersDto })
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async listUsers(@Query() query: AdminUserQueryDto): Promise<PaginatedAdminUsersDto> {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({
    summary: 'Get user details for admin',
    description: 'Returns safe user details plus optional active subscription summary.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiStandardNotFound('User not found')
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id/status')
  @ApiOperation({
    summary: 'Activate or deactivate a user',
    description:
      'Updates isActive. Deactivation revokes refresh sessions. Cannot deactivate the last active administrator.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiStandardBadRequest()
  @ApiStandardNotFound('User not found')
  @ApiStandardConflict('Would remove the last active administrator')
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.adminService.updateUserStatus(id, dto.isActive);
  }

  @Patch('users/:id/role')
  @ApiOperation({
    summary: 'Change user role',
    description:
      'Assigns USER or ADMIN. Cannot demote the last active administrator or demote your own account.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiStandardBadRequest('Invalid role')
  @ApiStandardNotFound('User not found')
  @ApiStandardConflict('Last-admin or self-demotion protection')
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async updateUserRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserRoleDto,
  ): Promise<UserResponseDto> {
    return this.adminService.updateUserRole(actor.id, id, dto.role);
  }

  @Get('users/:id/subscription')
  @ApiOperation({
    summary: 'Get active subscription for a user',
    description: 'Returns the active subscription and plan summary for the given user.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOkResponse({ type: AdminUserSubscriptionDto })
  @ApiStandardNotFound('User or active subscription not found')
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async getUserSubscription(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserSubscriptionDto> {
    return this.adminService.getUserSubscription(id);
  }

  @Get('users/:id/usage')
  @ApiOperation({
    summary: 'Get usage summary for a user',
    description:
      'Aggregates APIUsageLog totals and remaining requests for the user active billing period when available.',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOkResponse({ type: AdminUserUsageSummaryDto })
  @ApiStandardNotFound('User not found')
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async getUserUsage(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserUsageSummaryDto> {
    return this.adminService.getUserUsageSummary(id);
  }

  @Get('usage')
  @ApiOperation({
    summary: 'Usage analytics',
    description:
      'Aggregates APIUsageLog by provider, endpoint, status, and day with optional filters.',
  })
  @ApiOkResponse({ type: AdminUsageAnalyticsDto })
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async usage(@Query() query: AdminUsageAnalyticsQueryDto): Promise<AdminUsageAnalyticsDto> {
    return this.adminService.getUsageAnalytics(query);
  }

  @Get('logs')
  @ApiOperation({
    summary: 'List API request logs',
    description:
      'Paginated APIUsageLog entries. Error messages are sanitized. Secrets are never returned.',
  })
  @ApiOkResponse({ type: PaginatedAdminUsageLogsDto })
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async logs(@Query() query: AdminUsageLogsQueryDto): Promise<PaginatedAdminUsageLogsDto> {
    return this.adminService.getUsageLogs(query);
  }

  @Get('system/health')
  @ApiOperation({
    summary: 'Admin system health',
    description:
      'Database connectivity, uptime, version, and AI provider configuration status without secrets.',
  })
  @ApiOkResponse({ type: AdminSystemHealthDto })
  @ApiStandardUnauthorized()
  @ApiStandardForbidden('ADMIN role required')
  @ApiStandardTooManyRequests()
  async systemHealth(): Promise<AdminSystemHealthDto> {
    return this.adminService.getSystemHealth();
  }
}
