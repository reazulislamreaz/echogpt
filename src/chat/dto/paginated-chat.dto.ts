import { ApiProperty } from '@nestjs/swagger';
import { ConversationResponseDto } from './conversation-response.dto';
import { MessageResponseDto } from './message-response.dto';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';

export class PaginatedConversationsDto {
  @ApiProperty({ type: [ConversationResponseDto] })
  items!: ConversationResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class PaginatedMessagesDto {
  @ApiProperty({ type: [MessageResponseDto] })
  items!: MessageResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class ConversationDeletedResponseDto {
  @ApiProperty({ example: 'Conversation deleted successfully' })
  message!: string;
}
