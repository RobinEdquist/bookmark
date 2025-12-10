import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @IsBoolean()
  isAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  canEditMetadata?: boolean;

  @IsOptional()
  @IsBoolean()
  canUploadAudiobooks?: boolean;

  @IsOptional()
  @IsBoolean()
  canDeleteAudiobooks?: boolean;

  @IsOptional()
  @IsBoolean()
  canGenerateApiKeys?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blacklistedTags?: string[];
}
