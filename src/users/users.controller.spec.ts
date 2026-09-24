import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let service: any;

  const mockUser: AuthenticatedUser = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    role: 'USER',
    firstName: 'First',
    lastName: 'Last',
    isActive: true,
  };

  const mockSafeProfile = {
    id: 'user-uuid-1',
    email: 'user@example.com',
    firstName: 'First',
    lastName: 'Last',
    avatarUrl: null,
    isActive: true,
    isEmailVerified: true,
    role: 'USER',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      getCurrentUserProfile: jest.fn().mockResolvedValue(mockSafeProfile),
      updateProfile: jest.fn().mockResolvedValue(mockSafeProfile),
      changePassword: jest.fn().mockResolvedValue({ message: 'Password changed successfully.' }),
      softDeleteAccount: jest.fn().mockResolvedValue({ message: 'Account successfully deleted' }),
      findAll: jest.fn().mockResolvedValue({
        items: [mockSafeProfile],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }),
      findById: jest.fn().mockResolvedValue(mockSafeProfile),
      toSafeUser: jest.fn().mockReturnValue(mockSafeProfile),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
    service = module.get(UsersService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile (GET /users/me)', () => {
    it('should return current user profile from authenticated context', async () => {
      const res = await controller.getProfile(mockUser);
      expect(res).toEqual(mockSafeProfile);
      expect(service.getCurrentUserProfile).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('updateProfile (PATCH /users/me)', () => {
    it('should update profile using authenticated context ID', async () => {
      const dto = { firstName: 'Updated' };
      const res = await controller.updateProfile(mockUser, dto);
      expect(res).toEqual(mockSafeProfile);
      expect(service.updateProfile).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('changePassword (PATCH /users/me/password)', () => {
    it('should delegate password change to UsersService', async () => {
      const dto = {
        currentPassword: 'OldPassword123!',
        newPassword: 'NewPassword123!',
      };
      const res = await controller.changePassword(mockUser, dto);
      expect(res.message).toBe('Password changed successfully.');
      expect(service.changePassword).toHaveBeenCalledWith(mockUser.id, dto);
    });
  });

  describe('deleteAccount (DELETE /users/me)', () => {
    it('should delegate soft deletion to UsersService', async () => {
      const res = await controller.deleteAccount(mockUser);
      expect(res.message).toBe('Account successfully deleted');
      expect(service.softDeleteAccount).toHaveBeenCalledWith(mockUser.id);
    });
  });

  describe('findAll (GET /users)', () => {
    it('should list users with pagination for admin', async () => {
      const res = await controller.findAll({ page: 1, limit: 20 });
      expect(res.items).toHaveLength(1);
      expect(res.meta.total).toBe(1);
      expect(service.findAll).toHaveBeenCalledWith(1, 20);
    });
  });
});
