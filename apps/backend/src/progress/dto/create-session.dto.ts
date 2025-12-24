import { IsDateString, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSessionDto {
  @ApiProperty({
    description: 'When the listening session started (ISO 8601)',
    example: '2025-01-15T10:30:00Z',
    format: 'date-time',
  })
  @IsDateString()
  startedAt!: string;

  @ApiProperty({
    description: 'When the listening session ended (ISO 8601)',
    example: '2025-01-15T11:00:00Z',
    format: 'date-time',
  })
  @IsDateString()
  endedAt!: string;

  @ApiProperty({
    description: 'Playback position at session start in seconds',
    example: 3600,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  startPosition!: number;

  @ApiProperty({
    description: 'Playback position at session end in seconds',
    example: 5400,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  endPosition!: number;

  @ApiProperty({
    description: 'Total duration of the session in seconds',
    example: 1800,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  durationSeconds!: number;
}
