import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HardcoverStatusResponseDto {
  @ApiProperty({ example: true, description: 'Whether API key is configured' })
  configured!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether to auto-sync new imports',
  })
  autoSyncOnImport!: boolean;
}

export class HardcoverAutoSyncResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: true })
  autoSyncOnImport!: boolean;
}

export class HardcoverValidateResponseDto {
  @ApiProperty({ example: true })
  valid!: boolean;

  @ApiPropertyOptional({ example: 'Invalid API key', nullable: true })
  error?: string | null;

  @ApiPropertyOptional({ example: 'john@example.com', nullable: true })
  username?: string | null;
}

export class HardcoverBookResultDto {
  @ApiProperty({ example: '12345' })
  id!: string;

  @ApiProperty({ example: 'the-way-of-kings' })
  slug!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({ type: [String], example: ['Brandon Sanderson'] })
  author_names?: string[];

  @ApiPropertyOptional({ example: 4.5, nullable: true })
  rating?: number | null;

  @ApiPropertyOptional({ example: 15000, nullable: true })
  ratings_count?: number | null;

  @ApiPropertyOptional({ nullable: true })
  image?: { url?: string } | null;

  @ApiPropertyOptional({ type: [String], example: ['Fantasy', 'Epic Fantasy'] })
  genres?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Adventurous'] })
  moods?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Violence'] })
  content_warnings?: string[];

  @ApiPropertyOptional({ nullable: true })
  featured_series?: { name?: string; position?: number } | null;

  @ApiPropertyOptional({ type: [String], example: ['978-0765326355'] })
  isbns?: string[];
}

export class HardcoverSearchResponseDto {
  @ApiProperty({ type: [HardcoverBookResultDto] })
  results!: HardcoverBookResultDto[];

  @ApiProperty({ example: 'The Way of Kings' })
  query!: string;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  perPage!: number;

  @ApiProperty({ example: 25 })
  total!: number;
}

export class HardcoverLinkDataDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 12345 })
  hardcoverId!: number;

  @ApiProperty({ example: 'the-way-of-kings' })
  slug!: string;

  @ApiProperty({ example: 'The Way of Kings' })
  title!: string;

  @ApiPropertyOptional({ example: 4.5, nullable: true })
  rating?: number | null;

  @ApiPropertyOptional({ example: 15000, nullable: true })
  ratingsCount?: number | null;

  @ApiPropertyOptional({
    example: 'https://hardcover.app/images/book.jpg',
    nullable: true,
  })
  imageUrl?: string | null;
}

export class HardcoverLinkResponseDto {
  @ApiPropertyOptional({ type: HardcoverLinkDataDto, nullable: true })
  link?: HardcoverLinkDataDto | null;
}

export class HardcoverLinkCreatedResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: HardcoverLinkDataDto })
  link!: HardcoverLinkDataDto;
}

export class HardcoverFailedItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  audiobookId!: string;

  @ApiProperty({ example: 'API rate limit exceeded' })
  error!: string;

  @ApiProperty({ example: 3 })
  retries!: number;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;
}

export class HardcoverQueueStatusResponseDto {
  @ApiProperty({ example: 10 })
  pendingCount!: number;

  @ApiProperty({ example: 2 })
  failedCount!: number;

  @ApiProperty({ type: [HardcoverFailedItemDto] })
  failedItems!: HardcoverFailedItemDto[];
}

export class HardcoverQueueCountResponseDto {
  @ApiProperty({ example: 15 })
  queuedCount!: number;
}
