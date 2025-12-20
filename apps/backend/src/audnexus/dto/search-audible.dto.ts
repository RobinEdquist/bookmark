import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
} from 'class-validator';

export const SUPPORTED_REGIONS = [
  'us',
  'ca',
  'uk',
  'au',
  'fr',
  'de',
  'jp',
  'it',
  'in',
  'es',
] as const;
export type SupportedRegion = (typeof SUPPORTED_REGIONS)[number];

export class SearchAudibleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_REGIONS)
  region?: SupportedRegion = 'us';
}

export class GetChaptersDto {
  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_REGIONS)
  region?: SupportedRegion = 'us';
}
