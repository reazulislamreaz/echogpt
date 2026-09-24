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
  ApiConflictResponse,
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
import { AdminCreatePlanDto, AdminUpdatePlanDto } from './dto/admin-plan.dto';
import { AdminUpdateSubscriptionStatusDto, PaginationQueryDto } from './dto/admin-subscription.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('admin')
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscription-plans')
  @ApiOperation({
    summary: 'List all subscription plans (Admin only)',
    description:
      'Retrieves all subscription plans, including inactive tiers, with full configuration.',
  })
  @ApiOkResponse({
    description: 'List of all subscription plans',
    type: [PlanResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async getPlans(): Promise<PlanResponseDto[]> {
    return this.subscriptionsService.getAllPlans();
  }

  @Post('subscription-plans')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new subscription plan (Admin only)',
    description: 'Creates a new subscription plan with name, slug, price, and request limits.',
  })
  @ApiOkResponse({
    description: 'Plan created successfully',
    type: PlanResponseDto,
  })
  @ApiConflictResponse({ description: 'Plan name or slug already in use' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async createPlan(@Body() dto: AdminCreatePlanDto): Promise<PlanResponseDto> {
    return this.subscriptionsService.adminCreatePlan(dto);
  }

  @Patch('subscription-plans/:id')
  @ApiOperation({
    summary: 'Update subscription plan configuration (Admin only)',
    description:
      'Modifies plan properties like request limits, prices, and active state without corrupting user subscriptions.',
  })
  @ApiOkResponse({
    description: 'Plan updated successfully',
    type: PlanResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Subscription plan not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
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
      'Retrieves user subscriptions with pagination to manage and inspect user entitlements.',
  })
  @ApiOkResponse({
    description: 'Paginated user subscriptions list',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async getSubscriptions(@Query() query: PaginationQueryDto) {
    return this.subscriptionsService.adminGetSubscriptions(query.page, query.limit);
  }

  @Patch('subscriptions/:id/status')
  @ApiOperation({
    summary: 'Update subscription status (Admin only)',
    description: 'Changes lifecycle status of a subscription (e.g. PAST_DUE, EXPIRED, CANCELED).',
  })
  @ApiOkResponse({
    description: 'Subscription status updated successfully',
    type: SubscriptionResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Subscription not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async updateSubscriptionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateSubscriptionStatusDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.adminUpdateSubscriptionStatus(id, dto.status);
  }
}
