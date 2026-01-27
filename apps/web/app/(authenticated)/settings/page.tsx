"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { LibrariesSettings } from "../../../components/settings/libraries-settings";
import { UsersSettings } from "../../../components/settings/users-settings";
import { IntegrationsSettings } from "../../../components/settings/integrations-settings";
import { AnnouncementsSettings } from "../../../components/settings/announcements-settings";
import { GenresSettings } from "../../../components/settings/genres-settings";
import { authClient } from "../../../lib/auth-client";
import { useUrlTab } from "../../../lib/use-url-tab";

const VALID_TABS = ["libraries", "users", "integrations", "announcements", "genres"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function SettingsPage() {
  const router = useRouter();
  const t = useTranslations("settings");
  const { data: session, isPending, error } = authClient.useSession();

  const [activeTab, setActiveTab] = useUrlTab<TabValue>("tab", "libraries", VALID_TABS);
  const isAdmin = session?.user?.role === "admin";

  // Log settings page auth state
  useEffect(() => {
    console.log("[SettingsPage]", {
      isPending,
      hasSession: !!session,
      hasUser: !!session?.user,
      userRole: session?.user?.role,
      isAdmin,
      error: error?.message ?? null,
    });
  }, [isPending, session, isAdmin, error]);

  useEffect(() => {
    if (!isPending && !isAdmin) {
      console.log("[SettingsPage] Redirecting to /home - not admin", {
        isPending,
        isAdmin,
        userRole: session?.user?.role,
        hasUser: !!session?.user,
      });
      router.replace("/home");
    }
  }, [isPending, isAdmin, router, session?.user]);

  if (isPending || !isAdmin) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 overflow-x-hidden">
      <div className="mx-auto max-w-5xl space-y-6 overflow-hidden">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("description")}
          </p>
        </header>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
          <TabsList>
            <TabsTrigger value="libraries">{t("tabs.libraries")}</TabsTrigger>
            <TabsTrigger value="users">{t("tabs.users")}</TabsTrigger>
            <TabsTrigger value="integrations">{t("tabs.integrations")}</TabsTrigger>
            <TabsTrigger value="announcements">{t("tabs.announcements")}</TabsTrigger>
            <TabsTrigger value="genres">{t("tabs.genres")}</TabsTrigger>
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

          <TabsContent value="announcements">
            <AnnouncementsSettings />
          </TabsContent>

          <TabsContent value="genres">
            <GenresSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
