import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AudiobookBookmarkDto {
  @ApiProperty({ example: '7d5a1c8e-3f42-4b9a-9c60-2f1e8a54d7b3' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  audiobookId!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'The scene at the lighthouse',
    nullable: true,
  })
  note?: string | null;

  @ApiProperty({
    type: 'integer',
    example: 4523,
    description: 'Position in seconds from the start of the audiobook',
  })
  position!: number;

  @ApiProperty({ example: '2026-08-07T09:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-07T09:00:00.000Z' })
  updatedAt!: string;
}
