import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class LibrarySearchQueryDto {
  @ApiProperty({ description: 'Search query string' })
  @IsString()
  query!: string;

  @ApiPropertyOptional({
    description: 'Content type filter',
    enum: ['all', 'audiobooks', 'ebooks'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'audiobooks', 'ebooks'])
  contentType?: 'all' | 'audiobooks' | 'ebooks' = 'all';

  @ApiPropertyOptional({
    description: 'Maximum results per content type',
    default: 10,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  @Type(() => Number)
  limit?: number = 10;
}

export class LibrarySearchAuthorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class LibrarySearchItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  subtitle!: string | null;

  @ApiPropertyOptional({ nullable: true })
  coverUrl!: string | null;

  @ApiProperty({ type: [LibrarySearchAuthorDto] })
  authors!: LibrarySearchAuthorDto[];

  @ApiProperty({ description: 'Similarity score from 0 to 1' })
  similarity!: number;
}

export class LibrarySearchResponseDto {
  @ApiProperty({ type: [LibrarySearchItemDto] })
  audiobooks!: LibrarySearchItemDto[];

  @ApiProperty({ type: [LibrarySearchItemDto] })
  ebooks!: LibrarySearchItemDto[];
}
