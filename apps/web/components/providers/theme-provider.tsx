'use client';

import { useEffect } from 'react';
import { useTheme } from '../../lib/use-theme';
import { primaryColors, surfaceColors } from '../../lib/theme-config';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { primaryColor, surfaceColor } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const primary = primaryColors[primaryColor];
    const surface = surfaceColors[surfaceColor];

    // Apply primary color
    root.style.setProperty('--primary', primary.hsl);
    root.style.setProperty('--ring', primary.hsl);

    // Apply surface-derived colors
    Object.entries(surface.vars).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    // Set primary-foreground based on surface darkness
    root.style.setProperty(
      '--primary-foreground',
      surface.isDark ? surface.vars.background : surface.vars.foreground,
    );

    // Set destructive colors (consistent across themes)
    root.style.setProperty('--destructive', surface.isDark ? '0 70% 50%' : '0 84% 60%');
    root.style.setProperty(
      '--destructive-foreground',
      surface.isDark ? '0 0% 94%' : '0 0% 100%',
    );

    // Set accent (same as secondary for now)
    root.style.setProperty('--accent', surface.vars.secondary);
    root.style.setProperty('--accent-foreground', surface.vars['secondary-foreground']);
  }, [primaryColor, surfaceColor]);

  return <>{children}</>;
}
