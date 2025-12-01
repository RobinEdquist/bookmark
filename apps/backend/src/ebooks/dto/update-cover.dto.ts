import { IsString, IsOptional, IsUrl } from 'class-validator';

export class UpdateCoverDto {
  @IsOptional()
  @IsString()
  @IsUrl()
  url?: string;
}
