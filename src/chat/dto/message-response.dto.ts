import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MessageRole } from '@prisma/client';

export class MessageResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  conversationId!: string;

  @ApiProperty({ enum: MessageRole })
  role!: MessageRole;

  @ApiProperty()
  content!: string;

  @ApiPropertyOptional({ nullable: true })
  provider!: string | null;

  @ApiPropertyOptional({ nullable: true })
  model!: string | null;

  @ApiPropertyOptional({ nullable: true })
  promptTokens!: number | null;

  @ApiPropertyOptional({ nullable: true })
  completionTokens!: number | null;

  @ApiPropertyOptional({ nullable: true })
  totalTokens!: number | null;

  @ApiProperty()
  createdAt!: Date;
}
