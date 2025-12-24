import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProgressDto {
  @ApiProperty({
    description: 'Current playback position in seconds',
    example: 3600,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  position!: number;
}
