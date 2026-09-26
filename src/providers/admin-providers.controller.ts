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
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import {
  ApiAdminErrors,
  ApiStandardBadRequest,
  ApiStandardConflict,
  ApiStandardNotFound,
  ApiStandardUnprocessable,
} from '../common/swagger/api-error-responses';
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
@ApiBearerAuth('bearer')
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
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Cannot set an inactive provider as default')
  @ApiStandardConflict('Provider slug already exists')
  @ApiAdminErrors()
  async create(@Body() dto: CreateProviderDto): Promise<ProviderResponseDto> {
    return this.providersService.createProvider(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List AI providers (Admin only)',
    description:
      'Returns all system AI providers including inactive ones. API keys are never exposed (masked preview only when present).',
  })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  @ApiAdminErrors()
  async findAll(): Promise<ProviderResponseDto[]> {
    return this.providersService.listProviders(true);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get AI provider details (Admin only)',
    description: 'Returns provider metadata. Never includes the raw API key.',
  })
  @ApiParam({ name: 'id', description: 'AI provider UUID' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiStandardBadRequest('Invalid provider UUID')
  @ApiStandardNotFound('Provider not found')
  @ApiAdminErrors()
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderResponseDto> {
    return this.providersService.getProviderById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update AI provider (Admin only)',
    description: 'Updates provider metadata and optionally replaces the encrypted API key.',
  })
  @ApiParam({ name: 'id', description: 'AI provider UUID' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Invalid UUID or invalid provider state')
  @ApiStandardNotFound('Provider not found')
  @ApiStandardConflict('Provider slug already exists')
  @ApiAdminErrors()
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    return this.providersService.updateProvider(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Enable or disable AI provider (Admin only)',
    description:
      'Toggles provider availability. The system default provider cannot be deactivated.',
  })
  @ApiParam({ name: 'id', description: 'AI provider UUID' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Cannot deactivate the default provider or invalid UUID')
  @ApiStandardNotFound('Provider not found')
  @ApiAdminErrors()
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
  @ApiParam({ name: 'id', description: 'AI provider UUID' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiStandardBadRequest('Provider is inactive or invalid UUID')
  @ApiStandardNotFound('Provider not found')
  @ApiAdminErrors()
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
  @ApiParam({ name: 'id', description: 'AI provider UUID' })
  @ApiOkResponse({ type: ProviderHealthCheckResponseDto })
  @ApiStandardBadRequest('Invalid provider UUID')
  @ApiStandardNotFound('Provider not found')
  @ApiAdminErrors()
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
  @ApiParam({ name: 'id', description: 'AI provider UUID' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiStandardBadRequest('Cannot delete the default provider or invalid UUID')
  @ApiStandardNotFound('Provider not found')
  @ApiAdminErrors()
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<MessageResponseDto> {
    return this.providersService.deleteProvider(id);
  }
}
