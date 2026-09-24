import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'secret-hash',
    firstName: 'First',
    lastName: 'Last',
    avatarUrl: null,
    isActive: true,
    isEmailVerified: false,
    roleId: 'role-1',
    role: { id: 'role-1', name: 'USER', description: null },
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      role: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  it('findById should return user with role', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const user = await service.findById('user-1');
    expect(user).toEqual(mockUser);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: { role: true },
    });
  });

  it('findByEmail should normalize email before query', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser);

    const user = await service.findByEmail('  TEST@Example.Com  ');
    expect(user).toEqual(mockUser);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
      include: { role: true },
    });
  });

  it('validateAccountStatus should throw on deleted user', () => {
    expect(() =>
      service.validateAccountStatus({
        isActive: true,
        deletedAt: new Date(),
      }),
    ).toThrow(UnauthorizedException);
  });

  it('validateAccountStatus should throw on deactivated user', () => {
    expect(() =>
      service.validateAccountStatus({
        isActive: false,
        deletedAt: null,
      }),
    ).toThrow(UnauthorizedException);
  });

  it('toSafeUser should omit passwordHash and deletedAt', () => {
    const safe = service.toSafeUser(mockUser);
    expect((safe as any).passwordHash).toBeUndefined();
    expect((safe as any).deletedAt).toBeUndefined();
    expect(safe.email).toBe(mockUser.email);
    expect(safe.role).toBe('USER');
  });
});
