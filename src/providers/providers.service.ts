import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AIProvider, Prisma, UserAIProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { buildKeyPreview, decryptSecret, encryptSecret } from '../common/utils/encryption.util';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProviderHealthCheckResponseDto } from './dto/provider-health-check-response.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { UpsertUserProviderDto } from './dto/upsert-user-provider.dto';
import { UserProviderResponseDto } from './dto/user-provider-response.dto';
import { checkProviderConnectivity } from './utils/provider-health.util';

type UserProviderWithProvider = UserAIProvider & { provider: AIProvider };

@Injectable()
export class ProvidersService {
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.encryptionKey = this.configService.getOrThrow<string>('app.encryption.key');
  }

  // ==========================================
  // ADMIN — SYSTEM PROVIDERS
  // ==========================================

  async createProvider(dto: CreateProviderDto): Promise<ProviderResponseDto> {
    const slug = dto.slug.trim().toUpperCase();

    const existing = await this.prisma.aIProvider.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException('A provider with this slug already exists');
    }

    const encryptedApiKey = dto.apiKey ? encryptSecret(dto.apiKey, this.encryptionKey) : null;
    const keyPreview = dto.apiKey ? buildKeyPreview(dto.apiKey) : null;
    const makeDefault = dto.isDefault === true;

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (makeDefault) {
          await tx.aIProvider.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }

        return tx.aIProvider.create({
          data: {
            name: dto.name.trim(),
            slug,
            description: dto.description?.trim() || null,
            baseUrl: dto.baseUrl?.trim() || null,
            encryptedApiKey,
            isActive: dto.isActive ?? true,
            isDefault: makeDefault,
          },
        });
      });

      return this.toSafeProvider(created, keyPreview);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A provider with this slug already exists');
      }
      throw error;
    }
  }

  async listProviders(includeInactive = true): Promise<ProviderResponseDto[]> {
    const providers = await this.prisma.aIProvider.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return providers.map((p) => this.toSafeProvider(p));
  }

  async getProviderById(id: string): Promise<ProviderResponseDto> {
    const provider = await this.findProviderOrThrow(id);
    return this.toSafeProvider(provider, this.safePreviewFromEncrypted(provider.encryptedApiKey));
  }

  async updateProvider(id: string, dto: UpdateProviderDto): Promise<ProviderResponseDto> {
    await this.findProviderOrThrow(id);

    const data: Prisma.AIProviderUpdateInput = {};
    let keyPreview: string | null | undefined;

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.baseUrl !== undefined) {
      data.baseUrl = dto.baseUrl?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }
    if (dto.apiKey !== undefined) {
      data.encryptedApiKey = encryptSecret(dto.apiKey, this.encryptionKey);
      keyPreview = buildKeyPreview(dto.apiKey);
    }

    const updated = await this.prisma.aIProvider.update({
      where: { id },
      data,
    });

    return this.toSafeProvider(
      updated,
      keyPreview ?? this.safePreviewFromEncrypted(updated.encryptedApiKey),
    );
  }

  async setProviderActive(id: string, isActive: boolean): Promise<ProviderResponseDto> {
    const provider = await this.findProviderOrThrow(id);

    if (!isActive && provider.isDefault) {
      throw new BadRequestException(
        'Cannot deactivate the default provider. Set another default provider first.',
      );
    }

    const updated = await this.prisma.aIProvider.update({
      where: { id },
      data: { isActive },
    });

    return this.toSafeProvider(updated);
  }

  async setDefaultProvider(id: string): Promise<ProviderResponseDto> {
    const provider = await this.findProviderOrThrow(id);

    if (!provider.isActive) {
      throw new BadRequestException('Cannot set an inactive provider as default');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.aIProvider.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });

      return tx.aIProvider.update({
        where: { id },
        data: { isDefault: true },
      });
    });

    return this.toSafeProvider(updated);
  }

  async deleteProvider(id: string): Promise<{ message: string }> {
    const provider = await this.findProviderOrThrow(id);

    if (provider.isDefault) {
      throw new BadRequestException(
        'Cannot delete the default provider. Set another default provider first.',
      );
    }

    await this.prisma.aIProvider.delete({ where: { id } });
    return { message: 'Provider deleted successfully' };
  }

  async healthCheck(id: string): Promise<ProviderHealthCheckResponseDto> {
    const provider = await this.findProviderOrThrow(id);
    let apiKey: string | null = null;

    if (provider.encryptedApiKey) {
      try {
        apiKey = decryptSecret(provider.encryptedApiKey, this.encryptionKey);
      } catch {
        return {
          providerId: provider.id,
          slug: provider.slug,
          healthy: false,
          status: 'misconfigured',
          message: 'Stored API key could not be decrypted',
          latencyMs: null,
          checkedAt: new Date(),
        };
      }
    }

    const result = await checkProviderConnectivity({
      slug: provider.slug,
      baseUrl: provider.baseUrl,
      apiKey,
    });

    return {
      providerId: provider.id,
      slug: provider.slug,
      healthy: result.healthy,
      status: result.status,
      message: result.message,
      latencyMs: result.latencyMs,
      checkedAt: new Date(),
    };
  }

  // ==========================================
  // USER — ACTIVE SYSTEM PROVIDERS + USER CONFIG
  // ==========================================

  async listActiveProvidersForUsers(): Promise<ProviderResponseDto[]> {
    return this.listProviders(false).then((providers) =>
      providers.map((p) => ({
        ...p,
        // Users must never see system key previews
        keyConfigured: false,
        keyPreview: null,
      })),
    );
  }

  async listUserProviders(userId: string): Promise<UserProviderResponseDto[]> {
    const rows = await this.prisma.userAIProvider.findMany({
      where: { userId },
      include: { provider: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return rows.map((row) => this.toSafeUserProvider(row));
  }

  async upsertUserProvider(
    userId: string,
    providerId: string,
    dto: UpsertUserProviderDto,
  ): Promise<UserProviderResponseDto> {
    const provider = await this.findProviderOrThrow(providerId);

    if (!provider.isActive) {
      throw new BadRequestException('Cannot configure an inactive system provider');
    }

    const makeDefault = dto.isDefault === true;
    const encryptedApiKey =
      dto.apiKey !== undefined ? encryptSecret(dto.apiKey, this.encryptionKey) : undefined;
    const keyPreview = dto.apiKey !== undefined ? buildKeyPreview(dto.apiKey) : undefined;

    const saved = await this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.userAIProvider.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.userAIProvider.upsert({
        where: {
          userId_providerId: { userId, providerId },
        },
        create: {
          userId,
          providerId,
          encryptedApiKey: encryptedApiKey ?? null,
          keyPreview: keyPreview ?? null,
          isEnabled: dto.isEnabled ?? true,
          isDefault: makeDefault,
        },
        update: {
          ...(encryptedApiKey !== undefined ? { encryptedApiKey, keyPreview } : {}),
          ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: makeDefault } : {}),
        },
        include: { provider: true },
      });
    });

    return this.toSafeUserProvider(saved);
  }

  async setUserDefaultProvider(
    userId: string,
    providerId: string,
  ): Promise<UserProviderResponseDto> {
    const row = await this.prisma.userAIProvider.findUnique({
      where: { userId_providerId: { userId, providerId } },
      include: { provider: true },
    });

    if (!row || row.userId !== userId) {
      throw new NotFoundException('User provider configuration not found');
    }

    if (!row.isEnabled) {
      throw new BadRequestException('Cannot set a disabled user provider as default');
    }

    if (!row.provider.isActive) {
      throw new BadRequestException('Cannot default to an inactive system provider');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.userAIProvider.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.userAIProvider.update({
        where: { id: row.id },
        data: { isDefault: true },
        include: { provider: true },
      });
    });

    return this.toSafeUserProvider(updated);
  }

  async deleteUserProvider(userId: string, providerId: string): Promise<{ message: string }> {
    const row = await this.prisma.userAIProvider.findUnique({
      where: { userId_providerId: { userId, providerId } },
    });

    if (!row) {
      throw new NotFoundException('User provider configuration not found');
    }

    if (row.userId !== userId) {
      throw new ForbiddenException('You do not own this provider configuration');
    }

    await this.prisma.userAIProvider.delete({ where: { id: row.id } });
    return { message: 'User provider configuration deleted successfully' };
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private async findProviderOrThrow(id: string): Promise<AIProvider> {
    const provider = await this.prisma.aIProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException(`AI provider with ID ${id} not found`);
    }
    return provider;
  }

  private safePreviewFromEncrypted(encryptedApiKey: string | null): string | null {
    if (!encryptedApiKey) {
      return null;
    }
    try {
      return buildKeyPreview(decryptSecret(encryptedApiKey, this.encryptionKey));
    } catch {
      return null;
    }
  }

  toSafeProvider(provider: AIProvider, keyPreview: string | null = null): ProviderResponseDto {
    return {
      id: provider.id,
      name: provider.name,
      slug: provider.slug,
      description: provider.description,
      baseUrl: provider.baseUrl,
      isActive: provider.isActive,
      isDefault: provider.isDefault,
      keyConfigured: Boolean(provider.encryptedApiKey),
      keyPreview: keyPreview ?? (provider.encryptedApiKey ? '****' : null),
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  toSafeUserProvider(row: UserProviderWithProvider): UserProviderResponseDto {
    return {
      id: row.id,
      providerId: row.providerId,
      provider: {
        ...this.toSafeProvider(row.provider),
        keyConfigured: false,
        keyPreview: null,
      },
      isEnabled: row.isEnabled,
      isDefault: row.isDefault,
      keyConfigured: Boolean(row.encryptedApiKey),
      keyPreview: row.keyPreview,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
