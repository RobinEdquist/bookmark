import { ApiProperty } from '@nestjs/swagger';

export class RequestAttemptDto {
  @ApiProperty({ format: 'uuid', description: 'Durable submission identity' })
  id!: string;
  @ApiProperty({
    description: 'Opaque source identity; legacy for migrated attempts',
  })
  moduleId!: string;
  @ApiProperty({ description: 'Selected release ID in this attempt’s source' })
  torrentId!: string;
  @ApiProperty({
    enum: ['submitting', 'tracking', 'uncertain', 'failed', 'complete'],
    description:
      'submitting: recorded before submission; tracking: download identity saved; uncertain: failed or interrupted submission needs reconciliation and is not automatically resubmitted (submitting attempts idle for thirty minutes are recovered at startup and every thirty seconds); failed: conclusive acquisition failure; complete: imported into the library.',
  })
  status!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Download identity, if known',
  })
  torrentHash!: string | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Failure or reconciliation reason, if any',
  })
  reason!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}
