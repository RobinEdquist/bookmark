"use client";

import { useTranslations } from "next-intl";
import { AppearanceSettings } from "../../../components/settings/appearance-settings";

export default function PreferencesPage() {
  const t = useTranslations("preferences");

  return (
    <div className="p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </header>

        <AppearanceSettings />
      </div>
    </div>
  );
}
