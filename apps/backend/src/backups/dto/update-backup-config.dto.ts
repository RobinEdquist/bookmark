import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

// @IsOptional() also waves through JSON null, which would reach the service
// and crash with a 500. Only `path` supports null (reset to the default
// location); the other fields use @ValidateIf so null fails validation.
export class UpdateBackupConfigDto {
  @ApiPropertyOptional({ example: true })
  @ValidateIf((dto: UpdateBackupConfigDto) => dto.enabled !== undefined)
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'null resets the location to the default backup directory',
    example: '/data/backups',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  path?: string | null;

  @ApiPropertyOptional({
    description:
      'Five-part cron expression evaluated in the server timezone. Only ' +
      'daily ("m h * * *"), weekly ("m h * * 0-6"), and monthly ' +
      '("m h 1-28 * *") shapes are accepted.',
    example: '0 2 * * *',
  })
  @ValidateIf((dto: UpdateBackupConfigDto) => dto.schedule !== undefined)
  @IsString()
  @MaxLength(100)
  schedule?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99, example: 7 })
  @ValidateIf((dto: UpdateBackupConfigDto) => dto.retention !== undefined)
  @IsInt()
  @Min(1)
  @Max(99)
  retention?: number;
}
