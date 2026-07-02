"use client";

import { Minus, Plus, Settings2, Check } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/ui/tabs";
import { cn } from "@repo/ui/lib/utils";
import { useTranslations } from "next-intl";

import { readerThemes, type ReaderThemeName } from "../../../lib/reader-themes";
import type { ReaderSettings } from "../../../lib/use-reader-settings";

interface ReaderSettingsPopoverProps {
  settings: ReaderSettings;
  onUpdate: (patch: Partial<ReaderSettings>) => void;
  /** Typography/layout controls only make sense for reflowable books. */
  showTypography: boolean;
}

const THEME_NAMES: ReaderThemeName[] = ["light", "sepia", "dark"];

export function ReaderSettingsPopover({
  settings,
  onUpdate,
  showTypography,
}: ReaderSettingsPopoverProps) {
  const t = useTranslations("ebooks");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon">
          <Settings2 className="h-5 w-5" />
          <span className="sr-only">{t("reader.settings")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        {/* Theme */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t("reader.theme")}
          </p>
          <div className="flex gap-2">
            {THEME_NAMES.map((name) => {
              const theme = readerThemes[name];
              const selected = settings.theme === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onUpdate({ theme: name })}
                  className={cn(
                    "flex h-10 flex-1 items-center justify-center rounded-md border text-sm transition-all",
                    selected
                      ? "border-primary ring-1 ring-primary"
                      : "border-border",
                  )}
                  style={{ backgroundColor: theme.bg, color: theme.fg }}
                  aria-pressed={selected}
                  aria-label={t(
                    `reader.theme${name.charAt(0).toUpperCase()}${name.slice(1)}` as Parameters<
                      typeof t
                    >[0],
                  )}
                >
                  {selected ? <Check className="h-4 w-4" /> : "Aa"}
                </button>
              );
            })}
          </div>
        </div>

        {showTypography && (
          <>
            {/* Font size */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("reader.fontSize")}
              </p>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={settings.fontSize <= 80}
                  onClick={() => onUpdate({ fontSize: settings.fontSize - 10 })}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="flex-1 text-center text-sm tabular-nums">
                  {settings.fontSize}%
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={settings.fontSize >= 160}
                  onClick={() => onUpdate({ fontSize: settings.fontSize + 10 })}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Font family */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("reader.fontFamily")}
              </p>
              <Tabs
                value={settings.fontFamily}
                onValueChange={(value) =>
                  onUpdate({ fontFamily: value as "serif" | "sans" })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="serif" className="flex-1 font-serif">
                    {t("reader.serif")}
                  </TabsTrigger>
                  <TabsTrigger value="sans" className="flex-1 font-sans">
                    {t("reader.sans")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Line spacing */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("reader.lineSpacing")}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {settings.lineHeight.toFixed(1)}
                </span>
              </div>
              <Slider
                value={[settings.lineHeight]}
                min={1.2}
                max={2.0}
                step={0.1}
                onValueChange={(value) => {
                  if (value[0] !== undefined)
                    onUpdate({ lineHeight: value[0] });
                }}
              />
            </div>

            {/* Margins */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("reader.margins")}
                </p>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {settings.margin}%
                </span>
              </div>
              <Slider
                value={[settings.margin]}
                min={3}
                max={10}
                step={1}
                onValueChange={(value) => {
                  if (value[0] !== undefined) onUpdate({ margin: value[0] });
                }}
              />
            </div>

            {/* Layout */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("reader.layout")}
              </p>
              <Tabs
                value={settings.flow}
                onValueChange={(value) =>
                  onUpdate({ flow: value as "paginated" | "scrolled" })
                }
              >
                <TabsList className="w-full">
                  <TabsTrigger value="paginated" className="flex-1">
                    {t("reader.paginated")}
                  </TabsTrigger>
                  <TabsTrigger value="scrolled" className="flex-1">
                    {t("reader.scrolled")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
