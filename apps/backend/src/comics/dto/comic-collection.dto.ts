import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class ListComicCollectionsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['name', 'recentlyAdded'] })
  @IsOptional()
  @IsIn(['name', 'recentlyAdded'])
  sortBy?: 'name' | 'recentlyAdded';

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

export class CreateComicCollectionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateComicCollectionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sortName?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class AddCollectionSeriesDto {
  @IsString()
  seriesId!: string;
}

export class ReorderCollectionSeriesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  seriesIds!: string[];
}
