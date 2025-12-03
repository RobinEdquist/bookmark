"use client";

import { useTranslations } from "next-intl";
import { AppearanceSettings } from "../../../components/settings/appearance-settings";
import { ApiKeysSettings } from "../../../components/settings/api-keys-settings";
import { useMyPermissions } from "../../../lib/use-users";
import { authClient } from "../../../lib/auth-client";

export default function PreferencesPage() {
  const t = useTranslations("preferences");
  const { data: session } = authClient.useSession();
  const { data: permissions } = useMyPermissions();

  const isAdmin = session?.user?.role === "admin";
  const canGenerateApiKeys = isAdmin || permissions?.canGenerateApiKeys;

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </header>

        <AppearanceSettings />

        {canGenerateApiKeys && <ApiKeysSettings />}
      </div>
    </div>
  );
}
