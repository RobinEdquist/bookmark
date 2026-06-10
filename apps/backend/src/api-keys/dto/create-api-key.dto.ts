import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiPropertyOptional({
    type: String,
    example: 'My iPhone',
    description:
      'Display name for the key. Defaults to "API Key YYYY-MM-DD" when omitted or blank.',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
