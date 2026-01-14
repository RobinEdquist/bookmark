import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAnnouncementDto {
  @ApiProperty({
    description: 'Title of the announcement',
    example: 'New Feature: Goodreads Ratings',
  })
  @IsString()
  title!: string;

  @ApiProperty({
    description: 'Message content of the announcement',
    example:
      'You can now link your audiobooks and ebooks to Goodreads to display ratings and genres.',
  })
  @IsString()
  message!: string;

  @ApiPropertyOptional({
    description: 'Whether the announcement is active',
    example: true,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
