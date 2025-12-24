import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PathMapping } from '../types/restore-session.types';

// DTO for starting a restore - no fields needed, just file upload
export class StartRestoreDto {
  // Empty - file is handled by multer
}

// DTO for path mapping validation
export class PathMappingDto implements PathMapping {
  @ApiProperty({
    description: 'Absolute path from the Audiobookshelf backup',
    example: '/audiobooks/library1',
  })
  @IsString()
  @IsNotEmpty()
  absPath!: string;

  @ApiProperty({
    description: 'Corresponding path in Simple Audiobook Vault',
    example: '/media/audiobooks',
  })
  @IsString()
  @IsNotEmpty()
  savPath!: string;
}

export class SetPathMappingsDto {
  @ApiProperty({
    description: 'Array of path mappings from ABS to SAV paths',
    type: [PathMappingDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PathMappingDto)
  pathMappings!: PathMappingDto[];
}

// DTO for user mapping update (only contains fields needed by backend)
export class UserMappingUpdateDto {
  @ApiProperty({
    description: 'User ID from the Audiobookshelf backup',
    example: 'abs-user-123',
  })
  @IsString()
  @IsNotEmpty()
  absUserId!: string;

  @ApiProperty({
    description: 'Corresponding user ID in SAV (null to skip user)',
    example: 'sav-user-456',
    nullable: true,
  })
  @IsString()
  @IsOptional()
  savUserId!: string | null;
}

export class SetUserMappingsDto {
  @ApiProperty({
    description: 'Array of user mappings from ABS to SAV users',
    type: [UserMappingUpdateDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserMappingUpdateDto)
  userMappings!: UserMappingUpdateDto[];
}

// DTO for restore options
export class SetRestoreOptionsDto {
  @ApiPropertyOptional({
    description: 'Import playback progress data',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  importProgress?: boolean = true;

  @ApiPropertyOptional({
    description: 'Import cover images',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  importCovers?: boolean = true;

  @ApiPropertyOptional({
    description: 'Import author images',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  importAuthorImages?: boolean = true;

  @ApiPropertyOptional({
    description: 'Overwrite existing items with matching paths',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  overwriteExisting?: boolean = false;

  @ApiPropertyOptional({
    description: 'Lock imported metadata from auto-updates',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  lockMetadata?: boolean = false;
}

// DTO for selecting library
export class SelectLibraryDto {
  @ApiProperty({
    description: 'ID of the library to restore into',
    example: 'lib-123',
  })
  @IsString()
  @IsNotEmpty()
  libraryId!: string;
}
