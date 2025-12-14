import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class SearchMamDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @IsOptional()
  @IsInt()
  @Min(0)
  offset?: number = 0;
}
