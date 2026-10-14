import { ApiProperty } from '@nestjs/swagger';

export class RequestSearchQueueDto {
  @ApiProperty({
    type: 'integer',
    minimum: 0,
    description:
      'Pending or waiting requests without a selected release whose availability check is due, excluding active search leases. Independent of the list status filter.',
  })
  overdueCount!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Earliest due check in the queue, or null when none are due.',
  })
  oldestDueAt!: string | null;
}
