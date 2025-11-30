"use client";

import { useEffect } from "react";
import { useTheme } from "../../lib/use-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();

  useEffect(() => {
    // Apply theme - "default" theme uses dark mode
    // Future themes can be added here
    if (theme === "default") {
      document.documentElement.classList.add("dark");
    }
  }, [theme]);

  return <>{children}</>;
}
