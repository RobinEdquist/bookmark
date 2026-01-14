import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({
    description: 'Title of the announcement',
    example: 'New Feature: Goodreads Ratings',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'Message content of the announcement',
    example:
      'You can now link your audiobooks and ebooks to Goodreads to display ratings and genres.',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Whether the announcement is active',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
