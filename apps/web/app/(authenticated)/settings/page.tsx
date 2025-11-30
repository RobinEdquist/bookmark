"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { LibrariesSettings } from "../../../components/settings/libraries-settings";
import { UsersSettings } from "../../../components/settings/users-settings";
import { IntegrationsSettings } from "../../../components/settings/integrations-settings";
import { authClient } from "../../../lib/auth-client";

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations("settings");
  const { data: session, isPending } = authClient.useSession();
  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isPending && !isAdmin) {
      router.replace("/home");
    }
  }, [isPending, isAdmin, router]);

  if (isPending || !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </header>

        <Tabs defaultValue="libraries">
          <TabsList>
            <TabsTrigger value="libraries">{t("tabs.libraries")}</TabsTrigger>
            <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
            <TabsTrigger value="integrations">{t("tabs.integrations")}</TabsTrigger>
          </TabsList>

          <TabsContent value="libraries">
            <LibrariesSettings />
          </TabsContent>

          <TabsContent value="users">
            <UsersSettings />
          </TabsContent>

          <TabsContent value="integrations">
            <IntegrationsSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
