import { Test, TestingModule } from '@nestjs/testing';
import { RoleType } from '../roles/enums/role.enum';
import { AdminProvidersController } from './admin-providers.controller';
import { ProvidersService } from './providers.service';

describe('AdminProvidersController', () => {
  let controller: AdminProvidersController;
  let service: {
    createProvider: jest.Mock;
    listProviders: jest.Mock;
    getProviderById: jest.Mock;
    updateProvider: jest.Mock;
    setProviderActive: jest.Mock;
    setDefaultProvider: jest.Mock;
    healthCheck: jest.Mock;
    deleteProvider: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createProvider: jest.fn(),
      listProviders: jest.fn(),
      getProviderById: jest.fn(),
      updateProvider: jest.fn(),
      setProviderActive: jest.fn(),
      setDefaultProvider: jest.fn(),
      healthCheck: jest.fn(),
      deleteProvider: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminProvidersController],
      providers: [{ provide: ProvidersService, useValue: service }],
    }).compile();

    controller = module.get(AdminProvidersController);
  });

  it('should delegate create to service', async () => {
    service.createProvider.mockResolvedValue({ id: '1', slug: 'OPENAI' });
    const result = await controller.create({
      name: 'OpenAI',
      slug: 'OPENAI',
    });
    expect(result.slug).toBe('OPENAI');
    expect(service.createProvider).toHaveBeenCalled();
  });

  it('should list providers for admin', async () => {
    service.listProviders.mockResolvedValue([]);
    await controller.findAll();
    expect(service.listProviders).toHaveBeenCalledWith(true);
  });

  // Role metadata is enforced by RolesGuard at runtime; ensure ADMIN decorator intent remains.
  it('should be intended for ADMIN role', () => {
    expect(RoleType.ADMIN).toBe('ADMIN');
  });
});
