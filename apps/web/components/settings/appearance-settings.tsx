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
import { useTheme, type Theme } from "../../lib/use-theme";
import type { Locale } from "../../i18n/config";

const languageNames: Record<string, string> = {
  en: "English",
  sv: "Svenska",
};

const themeNames: Record<string, string> = {
  default: "Default",
};

export function AppearanceSettings() {
  const t = useTranslations("preferences.appearance");
  const { locale, setLocale, isUpdating: isLocaleUpdating, locales } = useLocale();
  const { theme, setTheme, isUpdating: isThemeUpdating, themes } = useTheme();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <fieldset className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label htmlFor="theme" className="text-base font-medium">
              {t("theme.label")}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t("theme.description")}
            </p>
          </div>
          <Select
            value={theme}
            onValueChange={(value: string) => setTheme(value as Theme)}
            disabled={isThemeUpdating}
          >
            <SelectTrigger className="w-[180px]" id="theme">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {themes.map((themeOption) => (
                <SelectItem key={themeOption} value={themeOption}>
                  {themeNames[themeOption] || themeOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </fieldset>

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
            disabled={isLocaleUpdating}
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
