"use client";

import { useTranslations } from "next-intl";
import { Gauge } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@repo/ui/components/ui/drawer";
import { cn } from "@repo/ui/lib/utils";

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface SpeedDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRate: number;
  onSelectRate: (rate: number) => void;
}

export function SpeedDrawer({
  open,
  onOpenChange,
  currentRate,
  onSelectRate,
}: SpeedDrawerProps) {
  const t = useTranslations("player");

  const handleSelectRate = (rate: number) => {
    onSelectRate(rate);
    onOpenChange(false);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[50vh]">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            {t("speed")}
          </DrawerTitle>
        </DrawerHeader>
        <div className="p-2">
          <div className="grid grid-cols-4 gap-2">
            {PLAYBACK_RATES.map((rate) => {
              const isSelected = rate === currentRate;
              return (
                <button
                  key={rate}
                  onClick={() => handleSelectRate(rate)}
                  className={cn(
                    "flex h-12 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                    "hover:bg-accent focus:bg-accent focus:outline-none",
                    isSelected && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  {rate}x
                </button>
              );
            })}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
