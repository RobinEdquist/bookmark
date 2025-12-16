import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SeriesEntryDto {
  @IsString()
  seriesName!: string;

  @IsString()
  order!: string;
}

export class UpdateEbookDto {
  @IsOptional()
  @IsString()
  title?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  subtitle?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  description?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  publisher?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  language?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  publishedDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  isbn?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  asin?: string | null;

  @IsOptional()
  @IsNumber()
  pageCount?: number;

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
