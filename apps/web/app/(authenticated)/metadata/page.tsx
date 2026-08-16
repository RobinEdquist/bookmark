"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/ui/tabs";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { MetadataGapsPanel } from "../../../components/metadata-gaps/metadata-gaps-panel";
import { useMyPermissions } from "../../../lib/use-users";
import { useUrlTab } from "../../../lib/use-url-tab";

const VALID_TABS = ["audiobooks", "ebooks"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function MetadataGapsPage() {
  const router = useRouter();
  const t = useTranslations("admin.metadata");
  const { data: permissions, isLoading } = useMyPermissions();

  const [activeTab, setActiveTab] = useUrlTab<TabValue>(
    "type",
    "audiobooks",
    VALID_TABS,
  );

  // Same rule as the backend guard: editing metadata is a permission, not an
  // admin-only power, so anyone who can fix these items can see the list.
  const canEditMetadata = permissions?.canEditMetadata ?? false;

  useEffect(() => {
    if (!isLoading && !canEditMetadata) {
      router.replace("/home");
    }
  }, [isLoading, canEditMetadata, router]);

  if (isLoading || !canEditMetadata) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 overflow-x-hidden">
      <div className="mx-auto max-w-7xl space-y-6 overflow-hidden">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </header>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabValue)}
        >
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="audiobooks">{t("tabs.audiobooks")}</TabsTrigger>
            <TabsTrigger value="ebooks">{t("tabs.ebooks")}</TabsTrigger>
          </TabsList>

          <TabsContent value="audiobooks">
            <MetadataGapsPanel type="audiobook" />
          </TabsContent>

          <TabsContent value="ebooks">
            <MetadataGapsPanel type="ebook" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
