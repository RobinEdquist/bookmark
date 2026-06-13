import { ApiProperty } from '@nestjs/swagger';

export class LibraryStatsDto {
  @ApiProperty({
    example: 150,
    description: 'Total number of audiobooks in the library',
  })
  totalAudiobooks!: number;

  @ApiProperty({
    example: 50,
    description: 'Total number of ebooks in the library',
  })
  totalEbooks!: number;

  @ApiProperty({ example: 45, description: 'Total number of unique authors' })
  totalAuthors!: number;

  @ApiProperty({ example: 20, description: 'Total number of series' })
  totalSeries!: number;

  @ApiProperty({ example: 75, description: 'Total number of genres' })
  totalGenres!: number;

  @ApiProperty({
    example: '12.5 GB',
    description: 'Total storage used (formatted)',
  })
  totalStorageUsed!: string;

  @ApiProperty({
    example: 13421772800,
    description: 'Total storage used in bytes',
  })
  totalStorageUsedBytes!: number;
}

export class LibraryAvailabilityDto {
  @ApiProperty({
    example: true,
    description: 'Whether audiobook library is configured',
  })
  audiobooks!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether ebook library is configured',
  })
  ebooks!: boolean;

  @ApiProperty({
    example: false,
    description: 'Whether comic library is configured',
  })
  comics!: boolean;

  @ApiProperty({ example: false, description: 'Whether OPDS is enabled' })
  opds!: boolean;
}
