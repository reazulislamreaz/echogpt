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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ProviderResponseDto } from './dto/provider-response.dto';
import { UpsertUserProviderDto } from './dto/upsert-user-provider.dto';
import { UserProviderResponseDto } from './dto/user-provider-response.dto';
import { ProvidersService } from './providers.service';

@ApiTags('providers')
@ApiBearerAuth()
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
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async listActive(): Promise<ProviderResponseDto[]> {
    return this.providersService.listActiveProvidersForUsers();
  }

  @Get('me')
  @ApiOperation({
    summary: 'List current user AI provider configurations',
    description: 'Returns the authenticated user provider credentials metadata (never raw keys).',
  })
  @ApiOkResponse({ type: [UserProviderResponseDto] })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async listMine(@CurrentUser() user: AuthenticatedUser): Promise<UserProviderResponseDto[]> {
    return this.providersService.listUserProviders(user.id);
  }

  @Put('me/:providerId')
  @ApiOperation({
    summary: 'Create or update user AI provider configuration',
    description:
      'Stores an optional encrypted user API key and enable/default flags for a system provider.',
  })
  @ApiOkResponse({ type: UserProviderResponseDto })
  @ApiBadRequestResponse({ description: 'Inactive provider or invalid configuration' })
  @ApiNotFoundResponse({ description: 'System provider not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
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
  })
  @ApiOkResponse({ type: UserProviderResponseDto })
  @ApiBadRequestResponse({ description: 'Provider disabled or inactive' })
  @ApiNotFoundResponse({ description: 'User provider configuration not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
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
  })
  @ApiOkResponse({ description: 'Configuration deleted' })
  @ApiNotFoundResponse({ description: 'User provider configuration not found' })
  @ApiForbiddenResponse({ description: 'Ownership violation' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async removeMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('providerId', ParseUUIDPipe) providerId: string,
  ): Promise<{ message: string }> {
    return this.providersService.deleteUserProvider(user.id, providerId);
  }
}
