"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { LibrariesSettings } from "../../../components/settings/libraries-settings";
import { UsersSettings } from "../../../components/settings/users-settings";
import { IntegrationsSettings } from "../../../components/settings/integrations-settings";
import { authClient } from "../../../lib/auth-client";

const VALID_TABS = ["libraries", "users", "integrations"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settings");
  const { data: session, isPending, error } = authClient.useSession();

  // Get tab from query param, defaulting to "libraries"
  const tabParam = searchParams.get("tab");
  const validTab: TabValue = VALID_TABS.includes(tabParam as TabValue)
    ? (tabParam as TabValue)
    : "libraries";
  const [activeTab, setActiveTab] = useState<TabValue>(validTab);
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

  // Sync tab state with URL changes (e.g., browser back/forward)
  useEffect(() => {
    setActiveTab(validTab);
  }, [validTab]);

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
  }, [isPending, isAdmin, router, session?.user?.role]);

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

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)}>
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
