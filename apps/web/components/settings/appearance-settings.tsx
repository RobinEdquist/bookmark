"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { useLocale } from "../../lib/use-locale";
import type { Locale } from "../../i18n/config";

const languageNames: Record<string, string> = {
  en: "English",
  sv: "Svenska",
};

export function AppearanceSettings() {
  const t = useTranslations("settings.appearance");
  const { locale, setLocale, isUpdating, locales } = useLocale();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="language" className="text-base font-medium">
              {t("language.label")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("language.description")}
            </p>
          </div>
          <Select
            value={locale}
            onValueChange={(value: string) => setLocale(value as Locale)}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-[180px]" id="language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locales.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {languageNames[loc] || loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </fieldset>
      </CardContent>
    </Card>
  );
}
