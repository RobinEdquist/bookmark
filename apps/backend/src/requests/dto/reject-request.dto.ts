import { IsString, IsOptional } from 'class-validator';

export class RejectRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
