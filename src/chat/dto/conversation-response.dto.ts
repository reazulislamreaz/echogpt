import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageResponseDto } from './message-response.dto';

export class ConversationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  providerId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  model!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class ConversationDetailResponseDto extends ConversationResponseDto {
  @ApiProperty({ type: [MessageResponseDto] })
  messages!: MessageResponseDto[];
}

export class SendMessageResponseDto {
  @ApiProperty({ type: MessageResponseDto })
  userMessage!: MessageResponseDto;

  @ApiProperty({ type: MessageResponseDto })
  assistantMessage!: MessageResponseDto;
}
