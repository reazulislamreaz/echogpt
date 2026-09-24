import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  ApiStandardBadRequest,
  ApiStandardConflict,
  ApiStandardNotFound,
  ApiStandardTooManyRequests,
  ApiStandardUnauthorized,
} from '../common/swagger/api-error-responses';
import { DowngradeSubscriptionDto } from './dto/downgrade-subscription.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { SubscriptionResponseDto } from './dto/subscription-response.dto';
import { SubscriptionStatusResponseDto } from './dto/subscription-status-response.dto';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({
    summary: 'List active subscription plans',
    description:
      'Returns publicly available active subscription tiers with prices and request limits. `requestLimit: null` means unlimited.',
  })
  @ApiOkResponse({ type: [PlanResponseDto] })
  @ApiStandardTooManyRequests()
  async getPlans(): Promise<PlanResponseDto[]> {
    return this.subscriptionsService.getActivePlans();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current user subscription',
    description:
      'Returns the authenticated user active subscription, plan details, and current billing cycle window.',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async getMySubscription(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.subscriptionsService.getCurrentSubscription(user.id);
    return this.subscriptionsService.toSafeSubscription(sub);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get subscription usage and remaining requests',
    description:
      'Calculates successful request usage within the active billing cycle and reports remaining quota. `remainingRequests` is null when unlimited.',
  })
  @ApiOkResponse({ type: SubscriptionStatusResponseDto })
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async getStatus(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionStatusResponseDto> {
    return this.subscriptionsService.getSubscriptionStatus(user.id);
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upgrade subscription plan',
    description:
      'Transitions the authenticated user to a higher-tier plan in a transaction and starts a new billing period.',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiStandardBadRequest('Invalid plan slug or upgrade not allowed')
  @ApiStandardNotFound('Target plan does not exist or is inactive')
  @ApiStandardConflict('User already actively subscribed to this plan')
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async upgrade(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpgradeSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.upgrade(user.id, dto.planSlug);
  }

  @Post('downgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Downgrade subscription plan',
    description:
      'Schedules a subscription downgrade at the end of the current billing cycle, preserving entitlements until expiration.',
  })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  @ApiStandardBadRequest('User is already on this plan')
  @ApiStandardConflict('Subscription is already scheduled for downgrade')
  @ApiStandardNotFound('Target plan does not exist or is inactive')
  @ApiStandardUnauthorized()
  @ApiStandardTooManyRequests()
  async downgrade(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DowngradeSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.downgrade(user.id, dto.planSlug);
  }
}
