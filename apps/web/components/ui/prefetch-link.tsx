"use client";

import { useState } from "react";
import Link, { type LinkProps } from "next/link";

type PrefetchLinkProps = Omit<LinkProps, "prefetch"> &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    children: React.ReactNode;
  };

/**
 * A Link component that only prefetches on hover/focus instead of when
 * entering the viewport. Useful for lists with many items where prefetching
 * all visible links would cause excessive network requests.
 */
export function PrefetchLink({ children, onMouseEnter, onFocus, ...props }: PrefetchLinkProps) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);

  const handleMouseEnter = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setShouldPrefetch(true);
    onMouseEnter?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLAnchorElement>) => {
    setShouldPrefetch(true);
    onFocus?.(e);
  };

  return (
    <Link
      {...props}
      prefetch={shouldPrefetch ? undefined : false}
      onMouseEnter={handleMouseEnter}
      onFocus={handleFocus}
    >
      {children}
    </Link>
  );
}
