import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackerSearchDto {
  @ApiProperty({
    description: 'Search query string',
    example: 'Brandon Sanderson',
  })
  @IsString()
  query!: string;

  @ApiPropertyOptional({
    description: 'Filter by content type',
    example: 'audiobooks',
    enum: ['all', 'audiobooks', 'ebooks'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'audiobooks', 'ebooks'])
  contentType?: 'all' | 'audiobooks' | 'ebooks' = 'all';

  @ApiPropertyOptional({
    description: 'Fields to search in',
    example: ['title', 'author'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchIn?: string[];

  @ApiPropertyOptional({
    description: 'Filter by language IDs',
    example: [1, 2],
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  languages?: number[];

  @ApiPropertyOptional({
    description: 'Results per page',
    example: 25,
    enum: [10, 25, 50, 100],
    default: 25,
  })
  @IsOptional()
  @IsIn([10, 25, 50, 100])
  perPage?: number = 25;

  @ApiPropertyOptional({
    description: 'Pagination offset',
    example: 0,
    minimum: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
