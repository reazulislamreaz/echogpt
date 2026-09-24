import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { encryptSecret } from '../common/utils/encryption.util';
import { ProvidersService } from './providers.service';
import * as healthUtil from './utils/provider-health.util';

describe('ProvidersService', () => {
  let service: ProvidersService;
  let prisma: {
    aIProvider: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    userAIProvider: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  const encryptionKey = 'test-encryption-key-for-providers';

  const mockProvider = {
    id: 'provider-1',
    name: 'OpenAI',
    slug: 'OPENAI',
    description: 'OpenAI models',
    baseUrl: 'https://api.openai.com/v1',
    encryptedApiKey: encryptSecret('sk-test-secret-key', encryptionKey),
    isActive: true,
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      aIProvider: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      userAIProvider: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (callback: (tx: typeof prisma) => unknown) => {
          if (typeof callback === 'function') {
            return callback(prisma);
          }
          return callback;
        }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProvidersService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(encryptionKey),
          },
        },
      ],
    }).compile();

    service = module.get(ProvidersService);
  });

  describe('createProvider', () => {
    it('should create a provider and never expose the raw API key', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue(null);
      prisma.aIProvider.create.mockResolvedValue({
        ...mockProvider,
        isDefault: false,
      });

      const result = await service.createProvider({
        name: 'OpenAI',
        slug: 'openai',
        apiKey: 'sk-test-secret-key',
      });

      expect(result.slug).toBe('OPENAI');
      expect(result.keyConfigured).toBe(true);
      expect(result.keyPreview).toBe('****-key');
      expect(JSON.stringify(result)).not.toContain('sk-test-secret-key');
      expect(prisma.aIProvider.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'OPENAI',
            encryptedApiKey: expect.any(String),
          }),
        }),
      );
      const storedKey = prisma.aIProvider.create.mock.calls[0][0].data.encryptedApiKey as string;
      expect(storedKey).not.toBe('sk-test-secret-key');
    });

    it('should reject duplicate slug', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue(mockProvider);

      await expect(
        service.createProvider({
          name: 'OpenAI',
          slug: 'OPENAI',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listProviders', () => {
    it('should return safe provider DTOs', async () => {
      prisma.aIProvider.findMany.mockResolvedValue([mockProvider]);

      const result = await service.listProviders(true);
      expect(result).toHaveLength(1);
      expect(result[0].keyConfigured).toBe(true);
      expect(JSON.stringify(result)).not.toContain('sk-test-secret-key');
    });
  });

  describe('setDefaultProvider', () => {
    it('should clear previous default and set new default in a transaction', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue({
        ...mockProvider,
        id: 'provider-2',
        isDefault: false,
        slug: 'CLAUDE',
      });
      prisma.aIProvider.update.mockResolvedValue({
        ...mockProvider,
        id: 'provider-2',
        slug: 'CLAUDE',
        isDefault: true,
      });

      const result = await service.setDefaultProvider('provider-2');
      expect(result.isDefault).toBe(true);
      expect(prisma.aIProvider.updateMany).toHaveBeenCalledWith({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    });

    it('should reject inactive provider as default', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue({
        ...mockProvider,
        isActive: false,
      });

      await expect(service.setDefaultProvider('provider-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('setProviderActive', () => {
    it('should not allow deactivating the default provider', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue(mockProvider);

      await expect(service.setProviderActive('provider-1', false)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('deleteProvider', () => {
    it('should reject deleting the default provider', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue(mockProvider);

      await expect(service.deleteProvider('provider-1')).rejects.toThrow(BadRequestException);
    });

    it('should delete a non-default provider', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue({
        ...mockProvider,
        isDefault: false,
      });
      prisma.aIProvider.delete.mockResolvedValue(mockProvider);

      const result = await service.deleteProvider('provider-1');
      expect(result.message).toContain('deleted');
    });
  });

  describe('healthCheck', () => {
    it('should return healthy result without exposing secrets', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue(mockProvider);
      jest.spyOn(healthUtil, 'checkProviderConnectivity').mockResolvedValue({
        healthy: true,
        status: 'ok',
        message: 'Provider responded successfully',
        latencyMs: 50,
      });

      const result = await service.healthCheck('provider-1');
      expect(result.healthy).toBe(true);
      expect(JSON.stringify(result)).not.toContain('sk-test-secret-key');
    });

    it('should report misconfigured when no API key exists', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue({
        ...mockProvider,
        encryptedApiKey: null,
      });
      jest.spyOn(healthUtil, 'checkProviderConnectivity').mockResolvedValue({
        healthy: false,
        status: 'misconfigured',
        message: 'No API key is configured for this provider',
        latencyMs: null,
      });

      const result = await service.healthCheck('provider-1');
      expect(result.healthy).toBe(false);
      expect(result.status).toBe('misconfigured');
    });
  });

  describe('getProviderById', () => {
    it('should throw NotFoundException when missing', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue(null);
      await expect(service.getProviderById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('user provider ownership', () => {
    it('should upsert user provider for authenticated user only', async () => {
      prisma.aIProvider.findUnique.mockResolvedValue({
        ...mockProvider,
        isDefault: false,
      });
      prisma.userAIProvider.upsert.mockResolvedValue({
        id: 'uap-1',
        userId: 'user-1',
        providerId: 'provider-1',
        encryptedApiKey: encryptSecret('user-key-value', encryptionKey),
        keyPreview: '****alue',
        isEnabled: true,
        isDefault: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        provider: mockProvider,
      });

      const result = await service.upsertUserProvider('user-1', 'provider-1', {
        apiKey: 'user-key-value',
        isDefault: true,
      });

      expect(result.keyConfigured).toBe(true);
      expect(result.keyPreview).toBe('****alue');
      expect(JSON.stringify(result)).not.toContain('user-key-value');
    });

    it('should reject deleting another user configuration via missing row', async () => {
      prisma.userAIProvider.findUnique.mockResolvedValue(null);
      await expect(service.deleteUserProvider('user-1', 'provider-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
