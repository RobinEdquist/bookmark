import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User display name',
    example: 'John Doe',
    minLength: 1,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'User email address',
    example: 'john@example.com',
    format: 'email',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    description: 'User profile image URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({
    description: 'Whether the user is an administrator',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to edit audiobook/ebook metadata',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  canEditMetadata?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to upload content',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  canUpload?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to delete content',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to generate API keys',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  canGenerateApiKeys?: boolean;

  @ApiPropertyOptional({
    description: 'Permission to request new content',
    example: true,
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

export class BanUserDto {
  @ApiPropertyOptional({
    description: 'Reason for banning the user',
    example: 'Violated terms of service',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'When the ban expires (ISO 8601 date string)',
    example: '2025-12-31T23:59:59Z',
    format: 'date-time',
  })
  @IsOptional()
  @IsString()
  expiresAt?: string;
}
