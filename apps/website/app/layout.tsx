import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./mockups.css";
import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";

const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

const neonderthaw = localFont({
  src: "./fonts/Neonderthaw-Regular.ttf",
  variable: "--font-neonderthaw",
  display: "swap",
});

const SITE_URL = "https://getbookmark.app";
const DESCRIPTION =
  "Audiobooks first, with ebooks and comics on the same shelf. Metadata and ratings that fill themselves in, progress that follows you everywhere, and native apps for iPhone and Android. Self-hosted, open source, yours.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Bookmark — a self-hosted home for your audiobooks",
  description: DESCRIPTION,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Bookmark — a self-hosted home for your audiobooks",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Bookmark",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${neonderthaw.variable}`}>
      <body>
        <noscript>
          <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
        <div className="ambient" aria-hidden />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
