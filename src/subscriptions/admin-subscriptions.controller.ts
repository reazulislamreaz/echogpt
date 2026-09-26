import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AdminSubscriptionDetailDto,
  PaginatedAdminSubscriptionsDto,
} from '../admin/dto/admin-subscription-response.dto';
import {
  ApiAdminErrors,
  ApiStandardBadRequest,
  ApiStandardConflict,
  ApiStandardNotFound,
  ApiStandardUnprocessable,
} from '../common/swagger/api-error-responses';
import { Roles } from '../roles/decorators/roles.decorator';
import { RoleType } from '../roles/enums/role.enum';
import { RolesGuard } from '../roles/guards/roles.guard';
import { AdminCreatePlanDto, AdminUpdatePlanDto } from './dto/admin-plan.dto';
import { AdminSubscriptionQueryDto } from './dto/admin-subscription-query.dto';
import { AdminUpdateSubscriptionStatusDto } from './dto/admin-subscription.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('admin')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('admin')
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscription-plans')
  @ApiOperation({
    summary: 'List all subscription plans (Admin only)',
    description: 'Retrieves all subscription plans, including inactive tiers.',
  })
  @ApiOkResponse({ type: [PlanResponseDto] })
  @ApiAdminErrors()
  async getPlans(): Promise<PlanResponseDto[]> {
    return this.subscriptionsService.getAllPlans();
  }

  @Post('subscription-plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new subscription plan (Admin only)',
    description: 'Creates a subscription plan with name, slug, price, and request limits.',
  })
  @ApiCreatedResponse({ type: PlanResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardConflict('Plan name or slug already in use')
  @ApiAdminErrors()
  async createPlan(@Body() dto: AdminCreatePlanDto): Promise<PlanResponseDto> {
    return this.subscriptionsService.adminCreatePlan(dto);
  }

  @Patch('subscription-plans/:id')
  @ApiOperation({
    summary: 'Update subscription plan configuration (Admin only)',
    description:
      'Modifies plan properties such as request limits, prices, and active state without corrupting existing subscriptions.',
  })
  @ApiParam({ name: 'id', description: 'Subscription plan UUID' })
  @ApiOkResponse({ type: PlanResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Invalid plan UUID')
  @ApiStandardNotFound('Subscription plan not found')
  @ApiAdminErrors()
  async updatePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdatePlanDto,
  ): Promise<PlanResponseDto> {
    return this.subscriptionsService.adminUpdatePlan(id, dto);
  }

  @Get('subscriptions')
  @ApiOperation({
    summary: 'List all user subscriptions with pagination (Admin only)',
    description:
      'Retrieves user subscriptions with optional filters by status, planId, and userId.',
  })
  @ApiOkResponse({ type: PaginatedAdminSubscriptionsDto })
  @ApiStandardUnprocessable()
  @ApiAdminErrors()
  async getSubscriptions(
    @Query() query: AdminSubscriptionQueryDto,
  ): Promise<PaginatedAdminSubscriptionsDto> {
    return this.subscriptionsService.adminGetSubscriptions(query.page, query.limit, {
      status: query.status,
      planId: query.planId,
      userId: query.userId,
    });
  }

  @Get('subscriptions/:id')
  @ApiOperation({
    summary: 'Get subscription details (Admin only)',
    description: 'Returns a subscription with plan and safe user summary.',
  })
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiOkResponse({ type: AdminSubscriptionDetailDto })
  @ApiStandardBadRequest('Invalid subscription UUID')
  @ApiStandardNotFound('Subscription not found')
  @ApiAdminErrors()
  async getSubscription(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminSubscriptionDetailDto> {
    return this.subscriptionsService.adminGetSubscriptionById(id);
  }

  @Patch('subscriptions/:id/status')
  @ApiOperation({
    summary: 'Update subscription status (Admin only)',
    description: 'Changes lifecycle status of a subscription (e.g. PAST_DUE, EXPIRED, CANCELED).',
  })
  @ApiParam({ name: 'id', description: 'Subscription UUID' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Invalid subscription UUID')
  @ApiStandardNotFound('Subscription not found')
  @ApiAdminErrors()
  async updateSubscriptionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateSubscriptionStatusDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.adminUpdateSubscriptionStatus(id, dto.status);
  }
}
