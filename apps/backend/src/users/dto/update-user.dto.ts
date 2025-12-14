import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  image?: string;

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
  @IsBoolean()
  canRequestContent?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  blacklistedTags?: string[];

  @IsOptional()
  @IsBoolean()
  forcePasswordReset?: boolean;
}

export class BanUserDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string; // ISO date string
}
