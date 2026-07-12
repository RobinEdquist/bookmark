import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class SplitPersonDto {
  @ApiProperty({
    description: 'Replacement names for the split person',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value
          .map((entry) => (typeof entry === 'string' ? entry.trim() : entry))
          .filter(Boolean)
      : [],
  )
  @Type(() => String)
  names!: string[];
}
