import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProgressDto {
  @ApiProperty({
    type: 'integer',
    description: 'Current playback position in seconds',
    example: 3600,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  position!: number;

  @ApiPropertyOptional({
    type: String,
    description:
      'Client wall-clock timestamp (ISO-8601) at which this position was observed. ' +
      'When present and older than the server-side row, the server returns 409 Conflict ' +
      'with the current row in the body so the client can reconcile.',
    example: '2026-04-26T15:00:00.000Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}
