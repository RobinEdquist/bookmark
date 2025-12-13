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
import { isValidTheme, themeClasses, type Theme } from "../lib/theme-config";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});
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

  // Read theme from cookie for server-side rendering
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const theme: Theme = themeCookie && isValidTheme(themeCookie) ? themeCookie : "default";
  const themeClassName = themeClasses[theme].join(" ");

  return (
    <html lang={locale} className={themeClassName} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${neonderthaw.variable} font-sans antialiased`}
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
