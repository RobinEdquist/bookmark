'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  isValidPrimaryColor,
  isValidSurfaceColor,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SURFACE_COLOR,
  surfaceColors,
  type PrimaryColor,
  type SurfaceColor,
} from './theme-config';

// Re-export for convenience
export {
  primaryColorKeys,
  surfaceColorKeys,
  type PrimaryColor,
  type SurfaceColor,
} from './theme-config';

interface ThemeColors {
  primaryColor: PrimaryColor;
  surfaceColor: SurfaceColor;
}

function parseCookieTheme(): ThemeColors {
  if (typeof document === 'undefined') {
    return {
      primaryColor: DEFAULT_PRIMARY_COLOR,
      surfaceColor: DEFAULT_SURFACE_COLOR,
    };
  }

  const getCookie = (name: string) =>
    document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${name}=`))
      ?.split('=')[1];

  const primaryColor = getCookie('primaryColor');
  const surfaceColor = getCookie('surfaceColor');

  return {
    primaryColor:
      primaryColor && isValidPrimaryColor(primaryColor)
        ? primaryColor
        : DEFAULT_PRIMARY_COLOR,
    surfaceColor:
      surfaceColor && isValidSurfaceColor(surfaceColor)
        ? surfaceColor
        : DEFAULT_SURFACE_COLOR,
  };
}

async function fetchTheme(): Promise<ThemeColors> {
  const res = await fetch('/api/users/me/theme', {
    credentials: 'include',
  });

  if (!res.ok) {
    // Not logged in or error - use cookie or default
    return parseCookieTheme();
  }

  const data = await res.json();
  return {
    primaryColor: isValidPrimaryColor(data.primaryColor)
      ? data.primaryColor
      : DEFAULT_PRIMARY_COLOR,
    surfaceColor: isValidSurfaceColor(data.surfaceColor)
      ? data.surfaceColor
      : DEFAULT_SURFACE_COLOR,
  };
}

async function updateTheme(colors: ThemeColors): Promise<void> {
  // Always set cookies
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `primaryColor=${colors.primaryColor}; path=/; max-age=${maxAge}; SameSite=Lax`;
  document.cookie = `surfaceColor=${colors.surfaceColor}; path=/; max-age=${maxAge}; SameSite=Lax`;

  // Try to update server (will fail if not logged in, that's okay)
  try {
    await fetch('/api/users/me/theme', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(colors),
    });
  } catch {
    // Ignore - cookies are set regardless
  }
}

export function useTheme() {
  const queryClient = useQueryClient();

  const { data: colors = parseCookieTheme(), isLoading } = useQuery({
    queryKey: ['theme'],
    queryFn: fetchTheme,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: updateTheme,
    onSuccess: (_, newColors) => {
      queryClient.setQueryData(['theme'], newColors);
    },
  });

  const setPrimaryColor = useCallback(
    (primaryColor: PrimaryColor) => {
      mutation.mutate({ ...colors, primaryColor });
    },
    [mutation, colors],
  );

  const setSurfaceColor = useCallback(
    (surfaceColor: SurfaceColor) => {
      mutation.mutate({ ...colors, surfaceColor });
    },
    [mutation, colors],
  );

  const setTheme = useCallback(
    (newColors: ThemeColors) => {
      mutation.mutate(newColors);
    },
    [mutation],
  );

  return {
    primaryColor: colors.primaryColor,
    surfaceColor: colors.surfaceColor,
    isDark: surfaceColors[colors.surfaceColor].isDark,
    setPrimaryColor,
    setSurfaceColor,
    setTheme,
    isLoading,
    isUpdating: mutation.isPending,
  };
}
