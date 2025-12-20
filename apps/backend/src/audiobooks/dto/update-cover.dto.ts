import { IsOptional, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCoverDto {
  @ApiPropertyOptional({
    description:
      'URL to download cover image from (alternative to file upload)',
    example: 'https://example.com/cover.jpg',
  })
  @IsOptional()
  @IsUrl()
  url?: string;
}
