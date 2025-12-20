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

export class ImportChapterDto {
  @IsString()
  title!: string;

  @IsNumber()
  startTime!: number; // seconds

  @IsOptional()
  @IsNumber()
  endTime?: number; // seconds
}

export class ImportChaptersDto {
  @IsString()
  @Matches(/^[A-Z0-9]{10}$/, {
    message: 'ASIN must be exactly 10 alphanumeric characters',
  })
  asin!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportChapterDto)
  chapters!: ImportChapterDto[];
}
