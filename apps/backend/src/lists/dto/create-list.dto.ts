import {
  IsString,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateListDto {
  @ApiProperty({
    description: 'Name of the list',
    example: 'My Favorites',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({
    description: 'Whether the list is publicly visible',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
