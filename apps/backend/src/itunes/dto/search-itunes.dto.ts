import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
  Length,
} from 'class-validator';

export const ITUNES_MEDIA_TYPES = ['audiobook', 'ebook'] as const;
export type ItunesMediaType = (typeof ITUNES_MEDIA_TYPES)[number];

export class SearchItunesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  term!: string;

  @IsOptional()
  @IsString()
  @IsIn(ITUNES_MEDIA_TYPES)
  media?: ItunesMediaType = 'audiobook';

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string = 'US';
}
