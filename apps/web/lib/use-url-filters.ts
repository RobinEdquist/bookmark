"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

type UrlValue = string | string[] | number;

/**
 * Keeps a set of filter values in the URL query string.
 *
 * The sibling of `useUrlTab`, for screens whose whole state should survive
 * navigation: leave a filtered worklist to fix an item, press Back, and the
 * same filter is still applied. It also makes a filtered view linkable.
 *
 * Writes use `router.replace`, so toggling filters does not pile up history
 * entries — Back leaves the page rather than undoing one chip at a time.
 * Values equal to their default are dropped from the URL to keep it readable.
 *
 * `defaults` must be a stable reference (a module-level constant); it is a
 * dependency of the parsed result, so an inline object literal would produce a
 * new value object on every render.
 *
 * Parsing is driven by the type of each default: arrays come from a
 * comma-separated list, numbers from `Number`, everything else stays a string.
 * Callers still have to validate the *content* — anything can arrive in a URL.
 */
export function useUrlFilters<T extends Record<string, UrlValue>>(
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryString = searchParams.toString();

  const values = useMemo(() => {
    const params = new URLSearchParams(queryString);
    const parsed = { ...defaults };
    const entries = Object.entries(defaults) as [keyof T & string, UrlValue][];

    for (const [key, fallback] of entries) {
      const raw = params.get(key);
      if (raw === null) continue;
      parsed[key] = parseValue(raw, fallback) as T[keyof T & string];
    }

    return parsed;
  }, [queryString, defaults]);

  const setValues = useCallback(
    (patch: Partial<T>) => {
      const params = new URLSearchParams(queryString);

      const entries = Object.entries(patch) as [
        keyof T & string,
        UrlValue | undefined,
      ][];

      for (const [key, value] of entries) {
        if (value === undefined) continue;
        const fallback = defaults[key];
        const serialized = serializeValue(value);
        const isDefault =
          fallback !== undefined && serialized === serializeValue(fallback);

        if (serialized === "" || isDefault) {
          params.delete(key);
        } else {
          params.set(key, serialized);
        }
      }

      const query = params.toString();
      // scroll: false — a filter change is not a new page, and yanking the
      // reader back to the top on every chip click is disorienting.
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [queryString, router, pathname, defaults],
  );

  return [values, setValues];
}

function serializeValue(value: UrlValue): string {
  return Array.isArray(value) ? value.join(",") : String(value);
}

function parseValue(raw: string, fallback: UrlValue): UrlValue {
  if (Array.isArray(fallback)) {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof fallback === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return raw;
}
