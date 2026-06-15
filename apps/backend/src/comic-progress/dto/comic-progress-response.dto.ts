import { ApiProperty } from '@nestjs/swagger';

export class ComicProgressResponseDto {
  @ApiProperty({ description: 'Comic book ID' })
  comicBookId!: string;

  @ApiProperty({ description: 'Current page (zero-based)', example: 5 })
  currentPage!: number;

  @ApiProperty({ description: 'Total page count', example: 24 })
  pageCount!: number;

  @ApiProperty({
    enum: ['unread', 'in_progress', 'finished'],
    description: 'Read status',
  })
  status!: 'unread' | 'in_progress' | 'finished';

  @ApiProperty({ description: 'When the user first opened this issue' })
  startedAt!: string;

  @ApiProperty({ description: 'When the progress was last updated' })
  updatedAt!: string;
}
