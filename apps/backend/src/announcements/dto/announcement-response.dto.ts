import { ApiProperty } from '@nestjs/swagger';

/** An active announcement shown to the current user (GET /announcements/active). */
export class ActiveAnnouncementDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Scheduled maintenance' })
  title!: string;

  @ApiProperty({ example: 'The server will restart tonight at 2am UTC.' })
  message!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

/** Result of dismissing an announcement (POST /announcements/:id/dismiss). */
export class DismissAnnouncementResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}
