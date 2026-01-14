import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class EbookSummaryDto {
  @ApiProperty({ description: 'Ebook ID' })
  id!: string;

  @ApiProperty({ description: 'Ebook title' })
  title!: string;

  @ApiPropertyOptional({ description: 'Cover image URL' })
  coverUrl!: string | null;

  @ApiPropertyOptional({ description: 'Ebook format (epub, pdf, mobi)' })
  format!: string;
}

export class EbookProgressResponseDto {
  @ApiProperty({ description: 'Ebook ID' })
  ebookId!: string;

  @ApiPropertyOptional({
    description: 'EPUB CFI location',
    example: '/6/4[chap01ref]!/4/2/10/2:91',
  })
  cfi!: string | null;

  @ApiProperty({ description: 'Progress percentage (0-100)', example: 45 })
  progressPercent!: number;

  @ApiProperty({ description: 'Whether the ebook has been completed' })
  completed!: boolean;

  @ApiPropertyOptional({
    description: 'When the ebook was marked as completed',
  })
  completedAt!: string | null;

  @ApiProperty({ description: 'When the user first opened the ebook' })
  startedAt!: string;

  @ApiProperty({ description: 'When the progress was last updated' })
  updatedAt!: string;
}

export class EbookProgressWithEbookDto extends EbookProgressResponseDto {
  @ApiProperty({
    description: 'Ebook summary information',
    type: EbookSummaryDto,
  })
  ebook!: EbookSummaryDto;
}
