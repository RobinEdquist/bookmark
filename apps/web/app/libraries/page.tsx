"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import { AudiobookGrid } from "../../components/audiobooks/audiobook-grid";
import { useAudiobooks } from "../../lib/use-audiobooks";
import { authClient } from "../../lib/auth-client";

export default function LibrariesPage() {
  const t = useTranslations("audiobooks");
  const tCommon = useTranslations("common");
  const { data: session } = authClient.useSession();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";
  const { data, isLoading, error } = useAudiobooks();

  const handleSignOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          </div>
          <nav className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" asChild>
                <Link href="/settings">{tCommon("nav.settings")}</Link>
              </Button>
            )}
            <Button variant="outline" onClick={handleSignOut}>
              {tCommon("nav.signOut")}
            </Button>
          </nav>
        </header>

        <AudiobookGrid
          audiobooks={data?.audiobooks ?? []}
          isLoading={isLoading}
          error={error}
        />
      </div>
    </main>
  );
}
