import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateTtsConfigDto {
  @ApiPropertyOptional({
    description: 'Whether AI audiobook generation is enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Base URL of the OpenAI-compatible TTS server',
    example: 'http://tts:8880',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  baseUrl?: string | null;

  @ApiPropertyOptional({
    description: 'API key for the TTS server (if it requires one)',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  apiKey?: string | null;

  @ApiPropertyOptional({
    description: 'Voice used for narration',
    example: 'af_heart',
  })
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiPropertyOptional({
    description: 'Narration speed multiplier',
    example: 1.0,
    minimum: 0.5,
    maximum: 2.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  speed?: number;

  @ApiPropertyOptional({
    description: 'Model name sent to the TTS server',
    example: 'kokoro',
  })
  @IsOptional()
  @IsString()
  model?: string;
}

export class ValidateTtsConnectionDto {
  @ApiProperty({
    description: 'Base URL of the OpenAI-compatible TTS server to test',
    example: 'http://tts:8880',
  })
  @IsString()
  baseUrl!: string;

  @ApiPropertyOptional({ description: 'API key to test with', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  apiKey?: string | null;

  @ApiPropertyOptional({ description: 'Voice to test with' })
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiPropertyOptional({ description: 'Model to test with' })
  @IsOptional()
  @IsString()
  model?: string;
}

export class CreateTtsJobDto {
  @ApiProperty({
    description: 'Id of the ebook to narrate into an audiobook',
    format: 'uuid',
  })
  @IsUUID()
  ebookId!: string;

  @ApiPropertyOptional({
    description: 'Voice to narrate with (defaults to the configured voice)',
    example: 'af_heart',
  })
  @IsOptional()
  @IsString()
  voice?: string;
}
