import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SeriesEntryDto {
  @IsString()
  seriesName!: string;

  @IsString()
  order!: string;
}

export class UpdateAudiobookDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  publisher?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  publishedDate?: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsString()
  asin?: string;

  @IsOptional()
  @IsBoolean()
  isExplicit?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authorNames?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  narratorNames?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  genreNames?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagNames?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeriesEntryDto)
  series?: SeriesEntryDto[];
}
