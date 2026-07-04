import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Query params for GET /mobile-auth/start.
 * `state` is an app-generated nonce echoed back on the final deeplink so the
 * app can reject callbacks it did not initiate.
 */
export class MobileAuthStartDto {
  @IsString()
  @Length(8, 128)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  state!: string;

  // Display name for the minted API key; mirrors CreateApiKeyDto's cap.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

/**
 * Query params for GET /mobile-auth/complete. The global ValidationPipe runs
 * with forbidNonWhitelisted, so every param Better Auth may append on the
 * error path must be declared here.
 */
export class MobileAuthCompleteDto {
  @IsString()
  @Length(8, 128)
  @Matches(/^[A-Za-z0-9._~-]+$/)
  state!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  error_description?: string;
}
