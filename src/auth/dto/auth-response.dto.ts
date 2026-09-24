import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '../../users/dto/user-response.dto';

export class AuthTokensDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Signed JWT access token for authenticating API requests',
  })
  accessToken!: string;

  @ApiProperty({
    example: 'd9e0f6b4e78a2c1f938472910ab38472...',
    description: 'Opaque cryptographically secure refresh token',
  })
  refreshToken!: string;
}

export class LoginResponseDto extends AuthTokensDto {
  @ApiProperty({
    type: () => UserResponseDto,
    description: 'Safe authenticated user information',
  })
  user!: UserResponseDto;
}

export class RegisterResponseDto {
  @ApiProperty({
    example: 'User registered successfully. Please check your email to verify your account.',
    description: 'Status message indicating successful registration',
  })
  message!: string;

  @ApiProperty({
    type: () => UserResponseDto,
    description: 'Safe registered user details',
  })
  user!: UserResponseDto;
}

export class MessageResponseDto {
  @ApiProperty({
    example: 'Operation completed successfully.',
    description: 'Response message',
  })
  message!: string;
}
