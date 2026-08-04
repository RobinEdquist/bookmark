import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * The search-result fields the client already had on screen. Sent so a link
 * still gets usable metadata when the Goodreads book page can't be read (its
 * WAF challenge fails intermittently).
 */
export class LinkGoodreadsSearchResultDto {
  @ApiPropertyOptional({ example: "The Hitchhiker's Guide to the Galaxy" })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Douglas Adams' })
  @IsOptional()
  @IsString()
  author?: string;

  // `type: String` is explicit because a reflected `string | null` collapses to
  // `Object` in the emitted schema.
  @ApiPropertyOptional({
    type: String,
    example: 'https://images.gr-assets.com/books/1546071216s/386162.jpg',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  cover_url?: string | null;

  @ApiPropertyOptional({ type: String, example: '4.22', nullable: true })
  @IsOptional()
  @IsString()
  avg_rating?: string | null;
}

export class LinkGoodreadsDto {
  @ApiProperty({
    example: '386162-the-hitchhiker-s-guide-to-the-galaxy',
    description: 'Goodreads book ID or slug',
  })
  @IsString()
  @IsNotEmpty()
  goodreadsId!: string;

  @ApiPropertyOptional({ type: LinkGoodreadsSearchResultDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LinkGoodreadsSearchResultDto)
  searchResult?: LinkGoodreadsSearchResultDto;
}
