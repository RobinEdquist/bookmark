import {
  IsString,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateListDto {
  @ApiPropertyOptional({
    description: 'Name of the list',
    example: 'My Favorites',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    description: 'Whether the list is publicly visible',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
