import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    example: 'd9e0f6b4e78a2c1f938472910ab38472...',
    description: 'Specific raw refresh token to revoke. If omitted, active session is invalidated.',
  })
  @IsOptional()
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken?: string;
}
