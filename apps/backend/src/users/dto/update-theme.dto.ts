import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import {
  primaryColorKeys,
  surfaceColorKeys,
  type PrimaryColor,
  type SurfaceColor,
} from '../../common/theme-config.js';

export class UpdateThemeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(primaryColorKeys, {
    message: `primaryColor must be one of: ${primaryColorKeys.join(', ')}`,
  })
  primaryColor!: PrimaryColor;

  @IsString()
  @IsNotEmpty()
  @IsIn(surfaceColorKeys, {
    message: `surfaceColor must be one of: ${surfaceColorKeys.join(', ')}`,
  })
  surfaceColor!: SurfaceColor;
}
