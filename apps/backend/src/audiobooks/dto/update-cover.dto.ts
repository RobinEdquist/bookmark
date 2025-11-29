import { IsOptional, IsUrl } from 'class-validator';

export class UpdateCoverDto {
  @IsOptional()
  @IsUrl()
  url?: string;
}
