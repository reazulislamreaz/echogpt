import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174000',
    description: 'Unique user identifier (UUID)',
  })
  id!: string;

  @ApiProperty({
    example: 'user@example.com',
    description: 'User email address',
  })
  email!: string;

  @ApiPropertyOptional({
    example: 'John',
    description: 'User first name',
    nullable: true,
  })
  firstName!: string | null;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'User last name',
    nullable: true,
  })
  lastName!: string | null;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.jpg',
    description: 'User profile avatar URL',
    nullable: true,
  })
  avatarUrl!: string | null;

  @ApiProperty({
    example: true,
    description: 'Indicates whether the account is currently active',
  })
  isActive!: boolean;

  @ApiProperty({
    example: false,
    description: 'Indicates whether the user has verified their email address',
  })
  isEmailVerified!: boolean;

  @ApiProperty({
    example: 'USER',
    description: 'Assigned system role (USER, ADMIN)',
  })
  role!: string;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Account creation timestamp',
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-09-24T12:00:00.000Z',
    description: 'Account last update timestamp',
  })
  updatedAt!: Date;
}
