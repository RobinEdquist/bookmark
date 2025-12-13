// Theme configuration - shared between server and client

export const themes = [
  "default",
  "tokyo-night",
  "tokyo-storm",
  "tokyo-moon",
  "tokyo-day",
  "synthwave",
  "catppuccin-mocha",
  "catppuccin-macchiato",
  "catppuccin-frappe",
  "catppuccin-latte",
  "yin-yang",
  "yang-yin",
] as const;

export type Theme = (typeof themes)[number];

export function isValidTheme(theme: string): theme is Theme {
  return themes.includes(theme as Theme);
}

// Map theme to CSS classes
export const themeClasses: Record<Theme, string[]> = {
  default: ["dark"],
  "tokyo-night": ["dark", "theme-tokyo-night"],
  "tokyo-storm": ["dark", "theme-tokyo-storm"],
  "tokyo-moon": ["dark", "theme-tokyo-moon"],
  "tokyo-day": ["theme-tokyo-day"],
  synthwave: ["dark", "theme-synthwave"],
  "catppuccin-mocha": ["dark", "theme-catppuccin-mocha"],
  "catppuccin-macchiato": ["dark", "theme-catppuccin-macchiato"],
  "catppuccin-frappe": ["dark", "theme-catppuccin-frappe"],
  "catppuccin-latte": ["theme-catppuccin-latte"],
  "yin-yang": ["dark", "theme-yin-yang"],
  "yang-yin": ["theme-yang-yin"],
};

export const allThemeClasses = [
  "dark",
  "theme-tokyo-night",
  "theme-tokyo-storm",
  "theme-tokyo-moon",
  "theme-tokyo-day",
  "theme-synthwave",
  "theme-catppuccin-mocha",
  "theme-catppuccin-macchiato",
  "theme-catppuccin-frappe",
  "theme-catppuccin-latte",
  "theme-yin-yang",
  "theme-yang-yin",
];
