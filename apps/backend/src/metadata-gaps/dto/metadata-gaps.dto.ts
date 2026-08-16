import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  AUDIOBOOK_GAP_KEYS,
  EBOOK_GAP_KEYS,
  type GapCategory,
  type GapKey,
} from '../gap-definitions';

export const GAP_MEDIA_TYPES = ['audiobook', 'ebook'] as const;
export type GapMediaType = (typeof GAP_MEDIA_TYPES)[number];

export const GAP_SORTS = ['newest', 'oldest', 'title', 'mostGaps'] as const;
export type GapSort = (typeof GAP_SORTS)[number];

const ALL_GAP_KEYS: readonly string[] = [
  ...new Set<string>([...AUDIOBOOK_GAP_KEYS, ...EBOOK_GAP_KEYS]),
];

export class ListMetadataGapsQueryDto {
  @ApiProperty({
    enum: GAP_MEDIA_TYPES,
    description: 'Which library to inspect',
  })
  @IsIn(GAP_MEDIA_TYPES)
  type!: GapMediaType;

  @ApiPropertyOptional({
    description:
      'Comma-separated gap keys to filter on. Omit to return every item ' +
      'that has at least one gap.',
    example: 'description,narrator',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsIn(ALL_GAP_KEYS, { each: true })
  missing?: string[];

  @ApiPropertyOptional({
    enum: ['any', 'all'],
    default: 'any',
    description:
      'Whether an item must have any of the selected gaps or all of them',
  })
  @IsOptional()
  @IsIn(['any', 'all'])
  match?: 'any' | 'all';

  @ApiPropertyOptional({ description: 'Search by title or subtitle' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: GAP_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(GAP_SORTS)
  sort?: GapSort;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class MetadataGapsSummaryQueryDto {
  @ApiProperty({ enum: GAP_MEDIA_TYPES })
  @IsIn(GAP_MEDIA_TYPES)
  type!: GapMediaType;
}

export class MetadataGapItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: GAP_MEDIA_TYPES, example: 'audiobook' })
  type!: GapMediaType;

  @ApiProperty({
    example: 'The Way of Kings',
    description:
      'Title after metadata-priority resolution — the same name the item is ' +
      'shown under everywhere else.',
  })
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  subtitle!: string | null;

  @ApiProperty({
    type: [String],
    enum: ALL_GAP_KEYS,
    enumName: 'MetadataGapKey',
    example: ['description', 'narrator', 'goodreadsLink'],
    description:
      'Gap keys this item currently has. Only keys that apply to this ' +
      'media type can appear.',
  })
  gaps!: GapKey[];

  @ApiProperty({ example: 3, description: 'Number of gaps on this item' })
  gapCount!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
  })
  coverUrl!: string | null;

  @ApiProperty({
    enum: ['available', 'missing', 'importing'],
    example: 'available',
  })
  status!: string;

  @ApiProperty({ example: '2026-08-16T10:00:00.000Z' })
  createdAt!: Date;
}

export class MetadataGapListDto {
  @ApiProperty({ type: [MetadataGapItemDto] })
  items!: MetadataGapItemDto[];

  @ApiProperty({
    example: 42,
    description: 'Total items matching the filter, ignoring pagination',
  })
  total!: number;
}

export class MetadataGapCountDto {
  @ApiProperty({
    enum: ALL_GAP_KEYS,
    enumName: 'MetadataGapKey',
    example: 'description',
  })
  key!: GapKey;

  @ApiProperty({ example: 42, description: 'Items missing this field' })
  count!: number;

  @ApiProperty({
    enum: ['essentials', 'audio', 'publication', 'matches'],
    enumName: 'MetadataGapCategory',
    example: 'essentials',
    description: 'What kind of data this is, used to group the filter chips',
  })
  category!: GapCategory;
}

export class MetadataGapsSummaryDto {
  @ApiProperty({ enum: GAP_MEDIA_TYPES, example: 'audiobook' })
  type!: GapMediaType;

  @ApiProperty({
    example: 1234,
    description: 'Items considered, excluding hidden ones',
  })
  totalItems!: number;

  @ApiProperty({
    example: 310,
    description: 'Items with at least one gap',
  })
  itemsWithGaps!: number;

  @ApiProperty({ type: [MetadataGapCountDto] })
  gaps!: MetadataGapCountDto[];
}
