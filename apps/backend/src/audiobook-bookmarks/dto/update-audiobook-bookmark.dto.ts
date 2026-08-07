import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Both fields are optional, but at least one must be provided —
 * an empty body is rejected with 400.
 */
export class UpdateAudiobookBookmarkDto {
  @ApiPropertyOptional({
    type: 'integer',
    description:
      'New bookmark position in seconds from the start of the audiobook',
    example: 4523,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({
    type: String,
    description:
      'New note for the bookmark. An empty or whitespace-only string clears the note (stored as null).',
    example: 'The scene at the lighthouse',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
