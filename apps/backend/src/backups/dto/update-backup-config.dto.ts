import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateBackupConfigDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '/data/backups',
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  path?: string | null;

  @ApiPropertyOptional({
    description: 'Five-part cron expression evaluated in the server timezone',
    example: '0 2 * * *',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  schedule?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 99, example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  retention?: number;
}
