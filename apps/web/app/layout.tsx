import type { Metadata } from "next";
import localFont from "next/font/local";
import { cookies } from "next/headers";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { ThemeProvider } from "../components/providers/theme-provider";
import { QueryProvider } from "../components/providers/query-provider";
import { IntlProvider } from "../components/providers/intl-provider";
import { PlayerProvider } from "../components/providers/player-provider";
import { Toaster } from "@repo/ui/components/ui/sonner";
import {
  isValidPrimaryColor,
  isValidSurfaceColor,
  primaryColors,
  surfaceColors,
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SURFACE_COLOR,
} from "../lib/theme-config";

const neonderthaw = localFont({
  src: "./fonts/Neonderthaw-Regular.ttf",
  variable: "--font-neonderthaw",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bookmark",
  description: "Your personal audiobook library",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  // Read color preferences from cookies for server-side rendering
  const cookieStore = await cookies();
  const primaryColorCookie = cookieStore.get("primaryColor")?.value;
  const surfaceColorCookie = cookieStore.get("surfaceColor")?.value;

  const primaryColor =
    primaryColorCookie && isValidPrimaryColor(primaryColorCookie)
      ? primaryColorCookie
      : DEFAULT_PRIMARY_COLOR;
  const surfaceColor =
    surfaceColorCookie && isValidSurfaceColor(surfaceColorCookie)
      ? surfaceColorCookie
      : DEFAULT_SURFACE_COLOR;

  const primary = primaryColors[primaryColor];
  const surface = surfaceColors[surfaceColor];

  // Build initial CSS variables for SSR to avoid flash of unstyled content
  const cssVars = {
    "--primary": primary.hsl,
    "--ring": primary.hsl,
    "--primary-foreground": surface.isDark
      ? surface.vars.background
      : surface.vars.foreground,
    "--destructive": surface.isDark ? "0 70% 50%" : "0 84% 60%",
    "--destructive-foreground": surface.isDark ? "0 0% 94%" : "0 0% 100%",
    "--accent": surface.vars.secondary,
    "--accent-foreground": surface.vars["secondary-foreground"],
    ...Object.fromEntries(
      Object.entries(surface.vars).map(([key, value]) => [`--${key}`, value])
    ),
  };

  return (
    <html
      lang={locale}
      style={cssVars as React.CSSProperties}
      suppressHydrationWarning
    >
      <body
        className={`${neonderthaw.variable} font-sans antialiased`}
      >
        <QueryProvider>
          <ThemeProvider>
            <IntlProvider locale={locale} messages={messages}>
              <PlayerProvider>
                {children}
                <Toaster />
              </PlayerProvider>
            </IntlProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
