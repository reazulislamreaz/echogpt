import { ApiProperty } from '@nestjs/swagger';

export class UserMessageResponseDto {
  @ApiProperty({
    example: 'Operation completed successfully.',
    description: 'Status message for account operations',
  })
  message!: string;
}
