import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new JwtAuthGuard(reflector);
  });

  const createMockContext = (): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({}),
      }),
    }) as unknown as ExecutionContext;

  it('should allow access without token if @Public decorator is applied', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    const context = createMockContext();
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when token has expired', () => {
    expect(() => guard.handleRequest(null, null, { name: 'TokenExpiredError' })).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when token is malformed', () => {
    expect(() => guard.handleRequest(null, null, { name: 'JsonWebTokenError' })).toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException when user is missing without error info', () => {
    expect(() => guard.handleRequest(null, null, undefined)).toThrow(UnauthorizedException);
  });

  it('should return authenticated user when validation passes', () => {
    const mockUser = {
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
    };
    expect(guard.handleRequest(null, mockUser, undefined)).toEqual(mockUser);
  });
});
