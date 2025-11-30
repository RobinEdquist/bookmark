import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateThemeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['default'], { message: 'Theme must be "default"' })
  theme!: string;
}
