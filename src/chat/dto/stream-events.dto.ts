import { ApiProperty } from '@nestjs/swagger';
import { SendMessageResponseDto } from './conversation-response.dto';

export class StreamChunkEventDto {
  @ApiProperty({ example: 'Hello ', description: 'Partial assistant text delta' })
  text!: string;
}

export class StreamErrorEventDto {
  @ApiProperty({ example: 'AI provider request failed' })
  message!: string;

  @ApiProperty({
    example: 502,
    description: 'Application error status embedded in the SSE error event',
  })
  statusCode!: number;
}

export class StreamDoneEventDto extends SendMessageResponseDto {}
