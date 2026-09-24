import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
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
      'Returns a list of all publicly available, active subscription tiers with their prices and request limits.',
  })
  @ApiOkResponse({
    description: 'Active subscription plans list',
    type: [PlanResponseDto],
  })
  async getPlans(): Promise<PlanResponseDto[]> {
    return this.subscriptionsService.getActivePlans();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user subscription',
    description:
      'Retrieves the authenticated user active subscription record, plan details, and current billing cycle window.',
  })
  @ApiOkResponse({
    description: 'Current user subscription',
    type: SubscriptionResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getMySubscription(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubscriptionResponseDto> {
    const sub = await this.subscriptionsService.getCurrentSubscription(user.id);
    return this.subscriptionsService.toSafeSubscription(sub);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get subscription usage and remaining requests',
    description:
      'Dynamically calculates request usage within the active billing cycle and reports remaining requests before quota exhaustion.',
  })
  @ApiOkResponse({
    description: 'Subscription status and dynamic usage quota',
    type: SubscriptionStatusResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getStatus(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionStatusResponseDto> {
    return this.subscriptionsService.getSubscriptionStatus(user.id);
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upgrade subscription plan',
    description:
      'Transitions the authenticated user to a higher tier plan in a transaction, setting a new active billing period.',
  })
  @ApiOkResponse({
    description: 'Subscription upgraded successfully',
    type: SubscriptionResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid plan slug' })
  @ApiNotFoundResponse({ description: 'Target plan does not exist or is inactive' })
  @ApiConflictResponse({ description: 'User already actively subscribed to this plan' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async upgrade(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpgradeSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.upgrade(user.id, dto.planSlug);
  }

  @Post('downgrade')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Downgrade subscription plan',
    description:
      'Schedules a subscription downgrade at the end of the current billing cycle, preserving entitlements until cycle expiration.',
  })
  @ApiOkResponse({
    description: 'Subscription downgrade scheduled successfully',
    type: SubscriptionResponseDto,
  })
  @ApiBadRequestResponse({ description: 'User is already on this plan' })
  @ApiConflictResponse({
    description: 'Subscription is already scheduled for downgrade',
  })
  @ApiNotFoundResponse({ description: 'Target plan does not exist or is inactive' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async downgrade(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DowngradeSubscriptionDto,
  ): Promise<SubscriptionResponseDto> {
    return this.subscriptionsService.downgrade(user.id, dto.planSlug);
  }
}
