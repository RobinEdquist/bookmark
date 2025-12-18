"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * Hook for persisting tab state in URL query parameters.
 *
 * Features:
 * - Reads initial value from URL on mount
 * - Syncs tab changes to URL
 * - Keeps URLs clean by removing default values
 * - Validates against allowed values
 *
 * @param paramName - URL parameter name (e.g., "tab", "status")
 * @param defaultValue - Default value when param is missing
 * @param validValues - Optional array of valid values for validation
 * @returns Tuple of [currentValue, setValue]
 */
export function useUrlTab<T extends string>(
  paramName: string,
  defaultValue: T,
  validValues?: readonly T[]
): [T, (value: T) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const value = useMemo(() => {
    const param = searchParams.get(paramName);
    if (!param) return defaultValue;
    if (validValues && !validValues.includes(param as T)) return defaultValue;
    return param as T;
  }, [searchParams, paramName, defaultValue, validValues]);

  const setValue = useCallback(
    (newValue: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newValue === defaultValue) {
        params.delete(paramName);
      } else {
        params.set(paramName, newValue);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, router, pathname, paramName, defaultValue]
  );

  return [value, setValue];
}
