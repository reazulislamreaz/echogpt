import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RoleType } from '../enums/role.enum';

interface RequestWithUser {
  user?: {
    id: string;
    email: string;
    role?: string;
    [key: string]: unknown;
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<(RoleType | string)[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Forbidden resource: access denied');
    }

    const hasRole = requiredRoles.some(
      (role) => user.role?.toUpperCase() === role.toString().toUpperCase(),
    );

    if (!hasRole) {
      throw new ForbiddenException('Forbidden resource: insufficient permissions');
    }

    return true;
  }
}
