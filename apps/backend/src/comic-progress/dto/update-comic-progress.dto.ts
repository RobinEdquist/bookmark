import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';

export class UpdateComicProgressDto {
  @ApiProperty({ description: 'Zero-based current page', minimum: 0 })
  @IsInt()
  @Min(0)
  currentPage!: number;

  @ApiProperty({ description: 'Total page count', minimum: 0 })
  @IsInt()
  @Min(0)
  pageCount!: number;

  @ApiProperty({ enum: ['unread', 'in_progress', 'finished'] })
  @IsEnum(['unread', 'in_progress', 'finished'])
  status!: 'unread' | 'in_progress' | 'finished';
}
