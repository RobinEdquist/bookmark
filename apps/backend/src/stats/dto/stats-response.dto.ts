import { ApiProperty } from '@nestjs/swagger';

/**
 * Aggregate, server-wide library and request statistics.
 *
 * Designed for at-a-glance dashboards (e.g. Glance). All values are
 * server-wide totals and contain no per-user information. Library counts
 * exclude items hidden from the library.
 */
export class StatsResponseDto {
  @ApiProperty({
    example: 1234,
    description: 'Number of audiobooks in the library (excludes hidden)',
  })
  audiobooks!: number;

  @ApiProperty({
    example: 567,
    description: 'Number of ebooks in the library (excludes hidden)',
  })
  ebooks!: number;

  @ApiProperty({
    example: 890,
    description:
      'Number of individual comic books in the library (excludes hidden)',
  })
  comics!: number;

  @ApiProperty({
    example: 4,
    description: 'Number of content requests currently awaiting approval',
  })
  pendingRequests!: number;

  @ApiProperty({
    example: 7,
    description: 'Number of content requests created since 00:00 UTC today',
  })
  requestsToday!: number;

  @ApiProperty({
    example: 152,
    description: 'Number of completed (fulfilled) content requests',
  })
  finishedRequests!: number;

  @ApiProperty({
    example: 987654,
    description:
      'Total time listened to audiobooks across all users on the server, in seconds',
  })
  totalListeningTimeSeconds!: number;
}
