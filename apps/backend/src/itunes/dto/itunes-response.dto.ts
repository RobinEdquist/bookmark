import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ItunesSearchResultDto {
  @ApiProperty({
    example: 1442351802,
    description: 'iTunes collection/track ID',
  })
  id!: number;

  @ApiProperty({ example: 'The Way of Kings', description: 'Book title' })
  title!: string;

  @ApiPropertyOptional({
    example: 'Brandon Sanderson',
    description: 'Author name',
  })
  author?: string;

  @ApiPropertyOptional({ description: 'Book description (may contain HTML)' })
  description?: string;

  @ApiProperty({
    type: [String],
    example: ['Sci-Fi & Fantasy'],
    description: 'Genres',
  })
  genres!: string[];

  @ApiPropertyOptional({
    example: '2010-08-31T07:00:00Z',
    description: 'Release date',
  })
  releaseDate?: string;

  @ApiPropertyOptional({
    example: 'https://is1-ssl.mzstatic.com/image/thumb/.../600x600bb.jpg',
    description: 'Cover artwork URL (600px)',
  })
  coverUrl?: string;
}

export class ItunesSearchResponseDto {
  @ApiProperty({
    type: [ItunesSearchResultDto],
    description: 'Search results from iTunes',
  })
  results!: ItunesSearchResultDto[];

  @ApiProperty({ example: 10, description: 'Total number of results' })
  total!: number;
}
