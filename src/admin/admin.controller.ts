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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { UserResponseDto } from '../users/dto/user-response.dto';
import { AdminService } from './admin.service';
import {
  AdminDashboardStatsDto,
  AdminSystemHealthDto,
  AdminUsageAnalyticsDto,
  PaginatedAdminUsageLogsDto,
} from './dto/admin-dashboard.dto';
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
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ========== Dashboard ==========

  @Get('dashboard')
  @ApiOperation({
    summary: 'Admin dashboard statistics',
    description:
      'Returns nested aggregate statistics for users, subscriptions, providers, usage, chat, search, and system health.',
  })
  @ApiOkResponse({ type: AdminDashboardStatsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async dashboard(): Promise<AdminDashboardStatsDto> {
    return this.adminService.getDashboardStats();
  }

  // ========== Users ==========

  @Get('users')
  @ApiOperation({
    summary: 'List users with search and filters',
    description:
      'Paginated admin user list with search, role, active, verification, and date filters. Never returns password or token hashes.',
  })
  @ApiOkResponse({ type: PaginatedAdminUsersDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async listUsers(@Query() query: AdminUserQueryDto): Promise<PaginatedAdminUsersDto> {
    return this.adminService.listUsers(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user details for admin' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async getUser(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.adminService.getUserDetail(id);
  }

  @Patch('users/:id/status')
  @ApiOperation({
    summary: 'Activate or deactivate a user',
    description:
      'Updates isActive. Deactivation revokes refresh sessions. Cannot deactivate the last active administrator.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'Would remove the last active administrator' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
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
  @ApiOkResponse({ type: UserResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid role' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'Last-admin or self-demotion protection' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async updateUserRole(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserRoleDto,
  ): Promise<UserResponseDto> {
    return this.adminService.updateUserRole(actor.id, id, dto.role);
  }

  @Get('users/:id/subscription')
  @ApiOperation({ summary: 'Get active subscription for a user' })
  @ApiOkResponse({ description: 'Active subscription with plan summary' })
  @ApiNotFoundResponse({ description: 'User or active subscription not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async getUserSubscription(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.getUserSubscription(id);
  }

  @Get('users/:id/usage')
  @ApiOperation({ summary: 'Get usage summary for a user' })
  @ApiOkResponse({ type: AdminUserUsageSummaryDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async getUserUsage(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserUsageSummaryDto> {
    return this.adminService.getUserUsageSummary(id);
  }

  // ========== Usage analytics ==========

  @Get('usage')
  @ApiOperation({
    summary: 'Usage analytics',
    description:
      'Aggregates APIUsageLog by provider, endpoint, status, and day with optional filters.',
  })
  @ApiOkResponse({ type: AdminUsageAnalyticsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async usage(@Query() query: AdminUsageAnalyticsQueryDto): Promise<AdminUsageAnalyticsDto> {
    return this.adminService.getUsageAnalytics(query);
  }

  @Get('usage/analytics')
  @ApiOperation({
    summary: 'Usage analytics (alias)',
    description: 'Alias of GET /admin/usage for backward compatibility.',
  })
  @ApiOkResponse({ type: AdminUsageAnalyticsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async usageAnalytics(
    @Query() query: AdminUsageAnalyticsQueryDto,
  ): Promise<AdminUsageAnalyticsDto> {
    return this.adminService.getUsageAnalytics(query);
  }

  // ========== Request logs ==========

  @Get('logs')
  @ApiOperation({
    summary: 'List API request logs',
    description:
      'Paginated APIUsageLog entries. Error messages are sanitized. Secrets are never returned.',
  })
  @ApiOkResponse({ type: PaginatedAdminUsageLogsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async logs(@Query() query: AdminUsageLogsQueryDto): Promise<PaginatedAdminUsageLogsDto> {
    return this.adminService.getUsageLogs(query);
  }

  @Get('usage/logs')
  @ApiOperation({
    summary: 'List API request logs (alias)',
    description: 'Alias of GET /admin/logs for backward compatibility.',
  })
  @ApiOkResponse({ type: PaginatedAdminUsageLogsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async usageLogs(@Query() query: AdminUsageLogsQueryDto): Promise<PaginatedAdminUsageLogsDto> {
    return this.adminService.getUsageLogs(query);
  }

  // ========== System health ==========

  @Get('system/health')
  @ApiOperation({
    summary: 'Admin system health',
    description:
      'Database connectivity, uptime, version, and AI provider configuration status without secrets.',
  })
  @ApiOkResponse({ type: AdminSystemHealthDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async systemHealth(): Promise<AdminSystemHealthDto> {
    return this.adminService.getSystemHealth();
  }

  @Get('health')
  @ApiOperation({
    summary: 'Admin system health (alias)',
    description: 'Alias of GET /admin/system/health for backward compatibility.',
  })
  @ApiOkResponse({ type: AdminSystemHealthDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async health(): Promise<AdminSystemHealthDto> {
    return this.adminService.getSystemHealth();
  }
}
