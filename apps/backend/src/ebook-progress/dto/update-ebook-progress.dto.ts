import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateEbookProgressDto {
  @ApiPropertyOptional({
    description:
      'EPUB CFI (Canonical Fragment Identifier) for precise location',
    example: '/6/4[chap01ref]!/4/2/10/2:91',
  })
  @IsOptional()
  @IsString()
  cfi?: string;

  @ApiProperty({
    description: 'Progress percentage (0-100)',
    example: 45,
    minimum: 0,
    maximum: 100,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  progressPercent!: number;
}
