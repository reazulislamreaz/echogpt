import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import {
  ApiAuthErrors,
  ApiStandardBadRequest,
  ApiStandardForbidden,
  ApiStandardNotFound,
  ApiStandardUnprocessable,
} from '../common/swagger/api-error-responses';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { UpsertUserProviderDto } from './dto/upsert-user-provider.dto';
import { UserProviderResponseDto } from './dto/user-provider-response.dto';
import { ProvidersService } from './providers.service';

@ApiTags('providers')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get()
  @ApiOperation({
    summary: 'List active AI providers',
    description:
      'Returns active system providers available for selection. System API keys are never exposed.',
  })
  @ApiOkResponse({ type: [ProviderResponseDto] })
  @ApiAuthErrors()
  async listActive(): Promise<ProviderResponseDto[]> {
    return this.providersService.listActiveProvidersForUsers();
  }

  @Get('me')
  @ApiOperation({
    summary: 'List current user AI provider configurations',
    description:
      'Returns the authenticated user provider credential metadata (masked key preview only; never raw keys).',
  })
  @ApiOkResponse({ type: [UserProviderResponseDto] })
  @ApiAuthErrors()
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<UserProviderResponseDto[]> {
    return this.providersService.listUserProviders(user.id);
  }

  @Put('me/:providerId')
  @ApiOperation({
    summary: 'Create or update user AI provider configuration',
    description:
      'Stores an optional encrypted user API key and enable/default flags for a system provider.',
  })
  @ApiParam({ name: 'providerId', description: 'System AI provider UUID' })
  @ApiOkResponse({ type: UserProviderResponseDto })
  @ApiStandardUnprocessable()
  @ApiStandardBadRequest('Inactive provider, invalid UUID, or invalid configuration')
  @ApiStandardNotFound('System provider not found')
  @ApiAuthErrors()
  async upsertMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Body() dto: UpsertUserProviderDto,
  ): Promise<UserProviderResponseDto> {
    return this.providersService.upsertUserProvider(user.id, providerId, dto);
  }

  @Post('me/:providerId/default')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set user default AI provider',
    description: 'Marks the given user provider configuration as the user default.',
  })
  @ApiParam({ name: 'providerId', description: 'System AI provider UUID' })
  @ApiOkResponse({ type: UserProviderResponseDto })
  @ApiStandardBadRequest('Provider disabled, inactive, or invalid UUID')
  @ApiStandardNotFound('User provider configuration not found')
  @ApiAuthErrors()
  async setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', ParseUUIDPipe) providerId: string,
  ): Promise<UserProviderResponseDto> {
    return this.providersService.setUserDefaultProvider(user.id, providerId);
  }

  @Delete('me/:providerId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete user AI provider configuration',
    description: 'Removes the authenticated user configuration for the given system provider.',
  })
  @ApiParam({ name: 'providerId', description: 'System AI provider UUID' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiStandardBadRequest('Invalid provider UUID')
  @ApiStandardNotFound('User provider configuration not found')
  @ApiStandardForbidden('Ownership violation')
  @ApiAuthErrors()
  async removeMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', ParseUUIDPipe) providerId: string,
  ): Promise<MessageResponseDto> {
    return this.providersService.deleteUserProvider(user.id, providerId);
  }
}
