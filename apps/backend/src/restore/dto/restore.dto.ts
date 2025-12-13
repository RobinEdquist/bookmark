import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PathMapping } from '../types/restore-session.types';

// DTO for starting a restore - no fields needed, just file upload
export class StartRestoreDto {
  // Empty - file is handled by multer
}

// DTO for path mapping validation
export class PathMappingDto implements PathMapping {
  @IsString()
  @IsNotEmpty()
  absPath!: string;

  @IsString()
  @IsNotEmpty()
  savPath!: string;
}

export class SetPathMappingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PathMappingDto)
  pathMappings!: PathMappingDto[];
}

// DTO for user mapping update (only contains fields needed by backend)
export class UserMappingUpdateDto {
  @IsString()
  @IsNotEmpty()
  absUserId!: string;

  @IsString()
  @IsOptional()
  savUserId!: string | null;
}

export class SetUserMappingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserMappingUpdateDto)
  userMappings!: UserMappingUpdateDto[];
}

// DTO for restore options
export class SetRestoreOptionsDto {
  @IsBoolean()
  @IsOptional()
  importProgress?: boolean = true;

  @IsBoolean()
  @IsOptional()
  importCovers?: boolean = true;

  @IsBoolean()
  @IsOptional()
  importAuthorImages?: boolean = true;

  @IsBoolean()
  @IsOptional()
  overwriteExisting?: boolean = false;

  @IsBoolean()
  @IsOptional()
  lockMetadata?: boolean = false;
}

// DTO for selecting library
export class SelectLibraryDto {
  @IsString()
  @IsNotEmpty()
  libraryId!: string;
}
