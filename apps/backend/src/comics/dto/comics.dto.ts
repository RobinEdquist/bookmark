// apps/backend/src/comics/dto/comics.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsArray,
  Max,
  Min,
} from 'class-validator';

export class ListComicSeriesQueryDto {
  @ApiPropertyOptional({ description: 'Search in title' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by exact publisher name' })
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional({ description: 'Filter by genre id' })
  @IsOptional()
  @IsString()
  genreId?: string;

  @ApiPropertyOptional({ enum: ['title', 'recentlyAdded', 'startYear'] })
  @IsOptional()
  @IsIn(['title', 'recentlyAdded', 'startYear'])
  sortBy?: 'title' | 'recentlyAdded' | 'startYear';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class UpdateComicSeriesDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  sortTitle?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  publisher?: string | null;

  @IsOptional()
  @IsString()
  imprint?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  startYear?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  totalIssueCount?: number | null;

  @IsOptional()
  @IsString()
  language?: string | null;

  @IsOptional()
  @IsString()
  ageRating?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateComicBookDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @IsString()
  number?: string | null;

  @IsOptional()
  @IsIn([
    'single_issue',
    'annual',
    'tpb',
    'omnibus',
    'one_shot',
    'special',
    'graphic_novel',
    'other',
  ])
  format?:
    | 'single_issue'
    | 'annual'
    | 'tpb'
    | 'omnibus'
    | 'one_shot'
    | 'special'
    | 'graphic_novel'
    | 'other';

  @IsOptional()
  @IsString()
  coverDate?: string | null;

  @IsOptional()
  @IsString()
  summary?: string | null;
}

export class UpdateComicCoverDto {
  @IsOptional()
  @IsString()
  url?: string;
}
