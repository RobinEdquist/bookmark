import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const VALID_THEMES = [
  'default',
  'tokyo-night',
  'tokyo-storm',
  'tokyo-moon',
  'tokyo-day',
  'synthwave',
  'catppuccin-mocha',
  'catppuccin-macchiato',
  'catppuccin-frappe',
  'catppuccin-latte',
  'yin-yang',
  'yang-yin',
] as const;

export type Theme = (typeof VALID_THEMES)[number];

export class UpdateThemeDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_THEMES, {
    message: `Theme must be one of: ${VALID_THEMES.join(', ')}`,
  })
  theme!: Theme;
}
