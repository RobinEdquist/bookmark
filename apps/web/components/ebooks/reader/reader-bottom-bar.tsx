"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import { useTranslations } from "next-intl";

interface ReaderBottomBarProps {
  /** Current position 0-100 (percent). */
  percent: number;
  /** Section/page label to show next to the percentage, if any. */
  positionLabel?: string | null;
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (percent: number) => void;
}

export function ReaderBottomBar({
  percent,
  positionLabel,
  disabled,
  onPrev,
  onNext,
  onSeek,
}: ReaderBottomBarProps) {
  const t = useTranslations("ebooks");
  const [sliderValue, setSliderValue] = useState(percent);
  const [isDragging, setIsDragging] = useState(false);

  // Follow reading position unless the user is dragging the slider
  useEffect(() => {
    if (!isDragging) setSliderValue(percent);
  }, [percent, isDragging]);

  return (
    <footer className="z-20 border-t bg-background/95 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrev}
          disabled={disabled}
        >
          <ChevronLeft className="h-5 w-5" />
          <span className="sr-only">{t("reader.previousPage")}</span>
        </Button>
        <Slider
          value={[sliderValue]}
          max={100}
          step={0.1}
          disabled={disabled}
          onValueChange={(value) => {
            setIsDragging(true);
            if (value[0] !== undefined) setSliderValue(value[0]);
          }}
          onValueCommit={(value) => {
            setIsDragging(false);
            if (value[0] !== undefined) onSeek(value[0]);
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onNext}
          disabled={disabled}
        >
          <ChevronRight className="h-5 w-5" />
          <span className="sr-only">{t("reader.nextPage")}</span>
        </Button>
      </div>
      <p className="mt-1 truncate text-center text-xs text-muted-foreground">
        {disabled
          ? t("reader.loading")
          : positionLabel
            ? `${positionLabel} · ${t("reader.progress", { percent: Math.round(sliderValue) })}`
            : t("reader.progress", { percent: Math.round(sliderValue) })}
      </p>
    </footer>
  );
}
