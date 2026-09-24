import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest<TUser = unknown>(err: unknown, user: unknown, info: unknown): TUser {
    if (err || !user) {
      const errorInfo = info as { name?: string; message?: string } | undefined;
      if (errorInfo?.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Authentication token has expired');
      }
      if (errorInfo?.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('Authentication token is malformed or invalid');
      }
      if (err instanceof Error) {
        throw err;
      }
      throw new UnauthorizedException('Authentication token is required');
    }

    return user as TUser;
  }
}
