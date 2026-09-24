import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../roles/decorators/roles.decorator';
import { RoleType } from '../roles/enums/role.enum';
import { RolesGuard } from '../roles/guards/roles.guard';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProviderHealthCheckResponseDto } from './dto/provider-health-check-response.dto';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { SetProviderActiveDto } from './dto/set-provider-active.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProvidersService } from './providers.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
@Controller('admin/ai-providers')
export class AdminProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create AI provider (Admin only)',
    description:
      'Creates a system AI provider. API keys are encrypted at rest and never returned in responses.',
  })
  @ApiCreatedResponse({ type: ProviderResponseDto })
  @ApiConflictResponse({ description: 'Provider slug already exists' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async create(@Body() dto: CreateProviderDto): Promise<ProviderResponseDto> {
    return this.providersService.createProvider(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List AI providers (Admin only)',
    description:
      'Returns all system AI providers including inactive ones. API keys are never exposed.',
  })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async findAll(): Promise<ProviderResponseDto[]> {
    return this.providersService.listProviders(true);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get AI provider details (Admin only)',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return this.providersService.getProviderById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update AI provider (Admin only)',
    description: 'Updates provider metadata and optionally replaces the encrypted API key.',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    return this.providersService.updateProvider(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Enable or disable AI provider (Admin only)',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiBadRequestResponse({ description: 'Cannot deactivate the default provider' })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProviderActiveDto,
  ): Promise<ProviderResponseDto> {
    return this.providersService.setProviderActive(id, dto.isActive);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set default AI provider (Admin only)',
    description: 'Clears the previous default and marks this provider as the system default.',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiBadRequestResponse({ description: 'Provider is inactive' })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async setDefault(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return this.providersService.setDefaultProvider(id);
  }

  @Post(':id/health-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run AI provider health check (Admin only)',
    description:
      'Performs a lightweight connectivity/credential check. Never returns or logs the API key.',
  })
  @ApiOkResponse({ type: ProviderHealthCheckResponseDto })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async healthCheck(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderHealthCheckResponseDto> {
    return this.providersService.healthCheck(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete AI provider (Admin only)',
    description: 'Deletes a non-default provider. Prefer disable for temporary unavailability.',
  })
  @ApiOkResponse({ description: 'Provider deleted successfully' })
  @ApiBadRequestResponse({ description: 'Cannot delete the default provider' })
  @ApiNotFoundResponse({ description: 'Provider not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'ADMIN role required' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ message: string }> {
    return this.providersService.deleteProvider(id);
  }
}
