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
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
import { AdminUpdateUserStatusDto } from './dto/admin-update-user-status.dto';
import { AdminUsageAnalyticsQueryDto, AdminUsageLogsQueryDto } from './dto/admin-usage-query.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Admin dashboard statistics',
    description:
      'Returns aggregated counts for users, subscriptions, providers, conversations, searches, and API usage.',
  })
  @ApiOkResponse({ type: AdminDashboardStatsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async dashboard(): Promise<AdminDashboardStatsDto> {
    return this.adminService.getDashboardStats();
  }

  @Get('usage/analytics')
  @ApiOperation({
    summary: 'Usage analytics',
    description:
      'Aggregates APIUsageLog data by provider, endpoint, and day. Optional from/to window filters.',
  })
  @ApiOkResponse({ type: AdminUsageAnalyticsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async usageAnalytics(
    @Query() query: AdminUsageAnalyticsQueryDto,
  ): Promise<AdminUsageAnalyticsDto> {
    return this.adminService.getUsageAnalytics(query.from, query.to);
  }

  @Get('usage/logs')
  @ApiOperation({
    summary: 'List API usage / request logs',
    description:
      'Paginated APIUsageLog entries with optional filters. Does not expose secrets or response bodies.',
  })
  @ApiOkResponse({ type: PaginatedAdminUsageLogsDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async usageLogs(@Query() query: AdminUsageLogsQueryDto): Promise<PaginatedAdminUsageLogsDto> {
    return this.adminService.getUsageLogs(query);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Admin system health',
    description:
      'Returns database connectivity and AI provider configuration status without exposing secrets.',
  })
  @ApiOkResponse({ type: AdminSystemHealthDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async health(): Promise<AdminSystemHealthDto> {
    return this.adminService.getSystemHealth();
  }

  @Patch('users/:id/status')
  @ApiOperation({
    summary: 'Activate or deactivate a user',
    description:
      'Updates user isActive. Deactivating a user also revokes all active refresh sessions.',
  })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async updateUserStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserStatusDto,
  ): Promise<UserResponseDto> {
    return this.adminService.updateUserStatus(id, dto.isActive);
  }
}
