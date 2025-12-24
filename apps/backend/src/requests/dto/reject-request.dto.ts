import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RejectRequestDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the request',
    example: 'Content not available on source',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
