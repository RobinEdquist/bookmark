"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { LibrariesSettings } from "../../components/settings/libraries-settings";
import { UsersSettings } from "../../components/settings/users-settings";
import { AuthenticationSettings } from "../../components/settings/authentication-settings";
import { authClient } from "../../lib/auth-client";

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations("settings");
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isPending && !isAdmin) {
      router.replace("/libraries");
    }
  }, [isPending, isAdmin, router]);

  if (isPending || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
            <p className="text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/libraries">{t("backToLibraries")}</Link>
          </Button>
        </header>

        <Tabs defaultValue="libraries">
          <TabsList>
            <TabsTrigger value="libraries">{t("tabs.libraries")}</TabsTrigger>
            <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
            <TabsTrigger value="authentication">{t("tabs.authentication")}</TabsTrigger>
          </TabsList>

          <TabsContent value="libraries">
            <LibrariesSettings />
          </TabsContent>

          <TabsContent value="users">
            <UsersSettings />
          </TabsContent>

          <TabsContent value="authentication">
            <AuthenticationSettings />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
