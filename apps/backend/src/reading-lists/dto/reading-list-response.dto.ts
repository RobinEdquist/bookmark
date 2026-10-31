import { ApiProperty } from '@nestjs/swagger';
import {
  READING_LIST_MEDIA_TYPES,
  type ReadingListMediaType,
} from '../reading-list-order';

export const READ_STATUSES = ['unread', 'in_progress', 'finished'] as const;
export type ReadStatus = (typeof READ_STATUSES)[number];

export class ReadingListListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: READING_LIST_MEDIA_TYPES })
  mediaType!: ReadingListMediaType;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty()
  entryCount!: number;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'API cover URL of the first item',
  })
  coverUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class ReadingListListResponseDto {
  @ApiProperty({ type: [ReadingListListItemDto] })
  readingLists!: ReadingListListItemDto[];

  @ApiProperty()
  total!: number;
}

export class ReadingListEntryDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Names the entry in moves, removals and notes: the item id, or for a missing item the entry id',
  })
  id!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'The comic issue, audiobook or ebook; null while missing',
  })
  itemId!: string | null;

  @ApiProperty({ description: 'The library does not have this item yet' })
  missing!: boolean;

  @ApiProperty({ description: '0-based place in the list' })
  position!: number;

  @ApiProperty({ nullable: true, type: String })
  note!: string | null;

  @ApiProperty({
    description:
      'Comics: series title and issue number. Books: the title. Missing items: the title they were given',
  })
  title!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Comics: the issue title. Books: the authors',
  })
  subtitle!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({ nullable: true, type: String, format: 'uuid' })
  seriesId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  seriesTitle!: string | null;

  @ApiProperty({ nullable: true, type: String })
  number!: string | null;

  @ApiProperty({ enum: READ_STATUSES })
  readStatus!: ReadStatus;
}

export class ReadingListDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: READING_LIST_MEDIA_TYPES })
  mediaType!: ReadingListMediaType;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  sortName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({
    type: [ReadingListEntryDto],
    description: 'In order, leaving out hidden and blacklisted items',
  })
  entries!: ReadingListEntryDto[];

  @ApiProperty({ description: 'Entries the caller has finished' })
  finishedCount!: number;

  @ApiProperty({ description: 'Entries the library does not have yet' })
  missingCount!: number;
}

export class ReadingListIdResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class ReadingListSuccessResponseDto {
  @ApiProperty()
  success!: boolean;
}

export class ReadingListAddResultDto {
  @ApiProperty()
  added!: number;

  @ApiProperty({ description: 'Items that were already in the list' })
  alreadyIn!: number;

  @ApiProperty()
  entryCount!: number;
}
