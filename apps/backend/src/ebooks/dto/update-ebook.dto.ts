import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsNumber,
} from 'class-validator';

export class UpdateEbookDto {
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
}
