"use client";

import { useEffect } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Always apply dark theme for now
    document.documentElement.classList.add("dark");
  }, []);

  return <>{children}</>;
}
