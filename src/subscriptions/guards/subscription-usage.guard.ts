import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SubscriptionsService } from '../subscriptions.service';

interface RequestWithUser {
  user?: {
    id: string;
    [key: string]: unknown;
  };
}

@Injectable()
export class SubscriptionUsageGuard implements CanActivate {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !user.id) {
      throw new UnauthorizedException('Authentication required to verify subscription quota');
    }

    // Reusable entitlement check: throws HTTP 429 if quota is reached
    await this.subscriptionsService.checkRequestAllowance(user.id);
    return true;
  }
}
