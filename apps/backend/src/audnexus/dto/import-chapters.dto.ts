import {
  IsString,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  Matches,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportChapterDto {
  @ApiProperty({
    description: 'Chapter title',
    example: 'Chapter 1: A Long-expected Party',
  })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Start time in seconds', example: 0 })
  @IsNumber()
  startTime!: number;

  @ApiPropertyOptional({
    description:
      'End time in seconds (optional, calculated from next chapter if omitted)',
    example: 1234,
  })
  @IsOptional()
  @IsNumber()
  endTime?: number;
}

export class ImportChaptersDto {
  @ApiProperty({
    description: 'Amazon ASIN (10 alphanumeric characters)',
    example: 'B007978NPG',
    pattern: '^[A-Z0-9]{10}$',
  })
  @IsString()
  @Matches(/^[A-Z0-9]{10}$/, {
    message: 'ASIN must be exactly 10 alphanumeric characters',
  })
  asin!: string;

  @ApiProperty({
    description: 'Array of chapters to import',
    type: [ImportChapterDto],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportChapterDto)
  chapters!: ImportChapterDto[];
}
