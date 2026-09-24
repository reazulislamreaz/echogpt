import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleType } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let rolesGuard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    rolesGuard = new RolesGuard(reflector);
  });

  const createMockContext = (user?: any): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('should allow access if no roles are required on route', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockContext();
    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should allow access if user possesses the required role', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleType.ADMIN]);

    const context = createMockContext({
      id: 'admin-id',
      email: 'admin@example.com',
      role: RoleType.ADMIN,
    });

    expect(rolesGuard.canActivate(context)).toBe(true);
  });

  it('should deny access and throw ForbiddenException if user lacks required role', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleType.ADMIN]);

    const context = createMockContext({
      id: 'user-id',
      email: 'user@example.com',
      role: RoleType.USER,
    });

    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny access if user is missing on request', () => {
    reflector.getAllAndOverride.mockReturnValue([RoleType.ADMIN]);

    const context = createMockContext(undefined);
    expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
  });
});
