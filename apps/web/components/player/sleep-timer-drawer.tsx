"use client";

import { useTranslations } from "next-intl";
import { Moon, BookOpen } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@repo/ui/components/ui/drawer";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";

const SLEEP_TIMER_PRESETS = [5, 15, 30, 45, 60] as const;

interface SleepTimerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isActive: boolean;
  activeType: "duration" | "endOfChapter" | null;
  remainingSeconds: number | null;
  hasChapters: boolean;
  onSelectDuration: (minutes: number) => void;
  onSelectEndOfChapter: () => void;
  onCancel: () => void;
}

export function SleepTimerDrawer({
  open,
  onOpenChange,
  isActive,
  activeType,
  remainingSeconds,
  hasChapters,
  onSelectDuration,
  onSelectEndOfChapter,
  onCancel,
}: SleepTimerDrawerProps) {
  const t = useTranslations("player");

  const handleSelectDuration = (minutes: number) => {
    onSelectDuration(minutes);
    onOpenChange(false);
  };

  const handleSelectEndOfChapter = () => {
    onSelectEndOfChapter();
    onOpenChange(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[50vh]">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2">
            <Moon className="h-5 w-5" />
            {t("sleepTimer")}
          </DrawerTitle>
        </DrawerHeader>
        <div className="p-3 space-y-3">
          {/* Duration presets */}
          <div className="grid grid-cols-5 gap-2">
            {SLEEP_TIMER_PRESETS.map((minutes) => {
              const isSelected = isActive && activeType === "duration" &&
                remainingSeconds !== null &&
                Math.ceil(remainingSeconds / 60) === minutes;
              return (
                <button
                  key={minutes}
                  onClick={() => handleSelectDuration(minutes)}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                    "hover:bg-accent focus:bg-accent focus:outline-none",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {t("sleepTimerMinutes", { minutes })}
                </button>
              );
            })}
          </div>

          {/* End of chapter option */}
          {hasChapters && (
            <button
              onClick={handleSelectEndOfChapter}
              className={cn(
                "flex w-full h-12 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors",
                "hover:bg-accent focus:bg-accent focus:outline-none",
                isActive && activeType === "endOfChapter" && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <BookOpen className="h-4 w-4" />
              {t("sleepTimerEndOfChapter")}
            </button>
          )}

          {/* Cancel button when timer is active */}
          {isActive && (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleCancel}
            >
              {t("sleepTimerCancel")}
            </Button>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
