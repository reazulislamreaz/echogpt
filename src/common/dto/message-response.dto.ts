import { ApiProperty } from '@nestjs/swagger';

/** Generic `{ message }` success payload used by delete/logout-style endpoints. */
export class MessageResponseDto {
  @ApiProperty({
    example: 'Operation completed successfully',
    description: 'Human-readable status message',
  })
  message!: string;
}
