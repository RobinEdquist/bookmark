import type { Metadata } from "next";
import localFont from "next/font/local";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";
import { ThemeProvider } from "../components/providers/theme-provider";
import { QueryProvider } from "../components/providers/query-provider";
import { IntlProvider } from "../components/providers/intl-provider";
import { PlayerProvider } from "../components/providers/player-provider";
import { Toaster } from "@repo/ui/components/ui/sonner";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Simple Audiobook Vault",
  description: "Your personal audiobook library",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
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
