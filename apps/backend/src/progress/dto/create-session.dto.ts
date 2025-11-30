import { IsDateString, IsInt, Min } from 'class-validator';

export class CreateSessionDto {
  @IsDateString()
  startedAt!: string;

  @IsDateString()
  endedAt!: string;

  @IsInt()
  @Min(0)
  startPosition!: number;

  @IsInt()
  @Min(0)
  endPosition!: number;

  @IsInt()
  @Min(0)
  durationSeconds!: number;
}
