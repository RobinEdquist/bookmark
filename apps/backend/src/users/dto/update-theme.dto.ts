import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  primaryColorKeys,
  surfaceColorKeys,
  type PrimaryColor,
  type SurfaceColor,
} from '../../common/theme-config.js';

export class UpdateThemeDto {
  @ApiProperty({
    description: 'Primary accent color for the UI',
    example: 'blue',
    enum: primaryColorKeys,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(primaryColorKeys, {
    message: `primaryColor must be one of: ${primaryColorKeys.join(', ')}`,
  })
  primaryColor!: PrimaryColor;

  @ApiProperty({
    description: 'Background/surface color for the UI',
    example: 'charcoal',
    enum: surfaceColorKeys,
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(surfaceColorKeys, {
    message: `surfaceColor must be one of: ${surfaceColorKeys.join(', ')}`,
  })
  surfaceColor!: SurfaceColor;
}
