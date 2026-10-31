import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  MAX_READING_LIST_ITEMS,
  READING_LIST_MEDIA_TYPES,
  type ReadingListMediaType,
} from '../reading-list-order';

export class ListReadingListsQueryDto {
  @ApiPropertyOptional({ enum: READING_LIST_MEDIA_TYPES })
  @IsOptional()
  @IsIn(READING_LIST_MEDIA_TYPES)
  mediaType?: ReadingListMediaType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only lists that hold this item',
  })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ enum: ['name', 'recentlyUpdated'] })
  @IsOptional()
  @IsIn(['name', 'recentlyUpdated'])
  sortBy?: 'name' | 'recentlyUpdated';

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

export class CreateReadingListDto {
  @ApiProperty({ enum: READING_LIST_MEDIA_TYPES })
  @IsIn(READING_LIST_MEDIA_TYPES)
  mediaType!: ReadingListMediaType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  sortName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateReadingListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  sortName?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  description?: string | null;
}

export class AddReadingListItemsDto {
  @ApiProperty({
    type: [String],
    description:
      'Items to add, in order: comic issues, audiobooks or ebooks, matching the list',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_READING_LIST_ITEMS)
  @IsUUID('all', { each: true })
  itemIds!: string[];

  @ApiPropertyOptional({
    description: 'Insert before this 0-based position. Default: at the end',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class ReorderReadingListDto {
  @ApiProperty({ type: [String], description: 'Every item, once, in order' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_READING_LIST_ITEMS)
  @IsUUID('all', { each: true })
  itemIds!: string[];
}

export class UpdateReadingListEntryDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({ description: 'Move the item to this 0-based place' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
