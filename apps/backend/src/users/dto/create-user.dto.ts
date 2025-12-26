import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({
    description: 'User display name',
    example: 'John Doe',
    minLength: 1,
  })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({
    description: 'User email address',
    example: 'john@example.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'User password',
    example: 'securePassword123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({
    description: 'Whether the user is an administrator',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to edit audiobook/ebook metadata',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canEditMetadata?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to upload content',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canUpload?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to delete content',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to generate API keys',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canGenerateApiKeys?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to request new content',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  canRequestContent?: boolean;

  @ApiPropertyOptional({
    description: 'Tag IDs to hide from this user (UUIDs)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    type: [String],
    format: 'uuid',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  blacklistedTags?: string[];
}
