import { ApiProperty } from '@nestjs/swagger';

/**
 * One of the discrete audiobook/ebook versions grouped under a canonical work
 * in the top-list ranking.
 */
export class TopListVersionDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ enum: ['audiobook', 'ebook'], example: 'audiobook' })
  itemType!: 'audiobook' | 'ebook';

  @ApiProperty({ example: 'Dune' })
  title!: string;
}

/**
 * Ranked entry returned by /api/lists/top, exposing the canonical identity,
 * primary representative version, and weighted rating signal.
 */
export class TopListItemDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description:
      'Canonical work identifier (id of the highest-priority source mapping)',
  })
  id!: string;

  @ApiProperty({
    enum: ['hardcover', 'goodreads', 'audiobook', 'ebook'],
    example: 'hardcover',
    description: 'Origin of the canonical id',
  })
  idSource!: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Library id of the representative version used for sorting',
  })
  primaryVersionId!: string;

  @ApiProperty({ enum: ['audiobook', 'ebook'], example: 'audiobook' })
  primaryVersionType!: 'audiobook' | 'ebook';

  @ApiProperty({ enum: ['audiobook', 'ebook'], example: 'audiobook' })
  itemType!: 'audiobook' | 'ebook';

  @ApiProperty({ example: 'Dune' })
  title!: string;

  @ApiProperty({
    example: '/api/audiobooks/550e8400-e29b-41d4-a716-446655440000/cover',
  })
  coverUrl!: string;

  @ApiProperty({ type: [String], example: ['Frank Herbert'] })
  authors!: string[];

  @ApiProperty({
    example: 4.21,
    description: 'Average rating from the chosen source',
  })
  rating!: number;

  @ApiProperty({
    example: 1284,
    description: 'Number of ratings backing the score',
  })
  ratingsCount!: number;

  @ApiProperty({
    enum: ['hardcover', 'goodreads'],
    example: 'hardcover',
    description: 'Which provider supplied the rating',
  })
  ratingSource!: string;

  @ApiProperty({
    example: 4.18,
    description: 'Weighted (Bayesian) ranking score',
  })
  weightedScore!: number;

  @ApiProperty({ type: [TopListVersionDto] })
  versions!: TopListVersionDto[];
}

/**
 * GET /api/lists/top response.
 */
export class ListsTopDto {
  @ApiProperty({
    type: [TopListItemDto],
    description: 'Items sorted by weighted rating',
  })
  topRated!: TopListItemDto[];

  @ApiProperty({
    type: [TopListItemDto],
    description: 'Items sorted by total ratings count',
  })
  mostVoted!: TopListItemDto[];
}
