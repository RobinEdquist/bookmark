import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  IsArray,
} from 'class-validator';

export class SearchMamDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsIn(['all', 'audiobooks', 'ebooks'])
  contentType?: 'all' | 'audiobooks' | 'ebooks' = 'all';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  searchIn?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  languages?: number[];

  @IsOptional()
  @IsIn([10, 25, 50, 100])
  perPage?: number = 25;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
