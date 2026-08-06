import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAudiobookBookmarkDto {
  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    description:
      'Optional client-generated UUID for the bookmark. Supplying one makes the request ' +
      'idempotent: replaying the same create returns the already-created bookmark instead ' +
      'of inserting a duplicate. Intended for offline write queues on mobile clients.',
    example: '7d5a1c8e-3f42-4b9a-9c60-2f1e8a54d7b3',
  })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({
    type: 'integer',
    description: 'Bookmark position in seconds from the start of the audiobook',
    example: 4523,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  position!: number;

  @ApiPropertyOptional({
    type: String,
    description:
      'Optional note or name for the bookmark. Whitespace-only values are stored as null; ' +
      'clients render bookmarks without a note using the formatted timestamp as the title.',
    example: 'The scene at the lighthouse',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
