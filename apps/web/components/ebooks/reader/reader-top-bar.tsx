"use client";

import { X, List } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useTranslations } from "next-intl";

import { ReaderSettingsPopover } from "./reader-settings";
import type { ReaderSettings } from "../../../lib/use-reader-settings";

interface ReaderTopBarProps {
  title: string;
  settings: ReaderSettings;
  onUpdateSettings: (patch: Partial<ReaderSettings>) => void;
  showTypography: boolean;
  hasToc: boolean;
  onOpenToc: () => void;
  onClose: () => void;
}

export function ReaderTopBar({
  title,
  settings,
  onUpdateSettings,
  showTypography,
  hasToc,
  onOpenToc,
  onClose,
}: ReaderTopBarProps) {
  const t = useTranslations("ebooks");

  return (
    <header className="z-20 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
      <Button variant="ghost" size="icon" onClick={onClose}>
        <X className="h-5 w-5" />
        <span className="sr-only">{t("reader.close")}</span>
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-center text-sm font-medium">
        {title}
      </h1>
      <div className="flex items-center gap-1">
        {hasToc && (
          <Button variant="ghost" size="icon" onClick={onOpenToc}>
            <List className="h-5 w-5" />
            <span className="sr-only">{t("reader.contents")}</span>
          </Button>
        )}
        <ReaderSettingsPopover
          settings={settings}
          onUpdate={onUpdateSettings}
          showTypography={showTypography}
        />
      </div>
    </header>
  );
}
