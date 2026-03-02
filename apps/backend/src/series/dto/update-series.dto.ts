import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MinLength } from 'class-validator';

export class UpdateSeriesDto {
  @ApiProperty({
    description: 'Series name',
    example: 'The Stormlight Archive',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  name!: string;
}
