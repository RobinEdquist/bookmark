"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@repo/ui/components/ui/drawer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { usePlayer } from "../providers/player-provider";
import { BookmarkForm } from "./bookmark-form";

/** Mirrors the player bar's ControlTooltip (kept local to avoid a cycle). */
function ControlTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

interface CapturedMoment {
  audiobookId: string;
  position: number;
}

/**
 * Freezes the playback moment when the bookmark UI opens. Playback keeps
 * running (and the player may even be stopped) without moving the timestamp
 * or losing the target audiobook.
 */
function useCapturedMoment() {
  const { audiobook, currentPosition, duration } = usePlayer();
  const [open, setOpen] = useState(false);
  const [captured, setCaptured] = useState<CapturedMoment | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next && audiobook) {
      setCaptured({
        audiobookId: audiobook.id,
        position: Math.floor(currentPosition),
      });
    }
    setOpen(next);
  };

  return {
    open,
    handleOpenChange,
    captured,
    max: duration > 0 ? Math.floor(duration) : null,
  };
}

/**
 * Desktop bookmark control: icon button in the player bar's right-hand
 * cluster, opening an anchored popover above the bar (no lightbox).
 */
export function AddBookmarkButtonDesktop() {
  const t = useTranslations("player");
  const { isLoading } = usePlayer();
  const { open, handleOpenChange, captured, max } = useCapturedMoment();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <ControlTooltip label={t("addBookmark")}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-8 w-8 sm:flex"
            disabled={isLoading}
            aria-label={t("addBookmark")}
            aria-haspopup="dialog"
          >
            <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
      </ControlTooltip>
      <PopoverContent side="top" align="end" className="w-80">
        {captured && (
          <div className="space-y-3">
            <p className="text-sm font-medium">{t("addBookmark")}</p>
            <BookmarkForm
              audiobookId={captured.audiobookId}
              initialPosition={captured.position}
              duration={max}
              onSaved={() => handleOpenChange(false)}
              onCancel={() => handleOpenChange(false)}
            />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Mobile bookmark control: labeled button in the player bar's extra-controls
 * row, opening a bottom drawer (same idiom as sleep timer and speed).
 */
export function AddBookmarkButtonMobile() {
  const t = useTranslations("player");
  const { isLoading } = usePlayer();
  const { open, handleOpenChange, captured, max } = useCapturedMoment();

  return (
    <>
      <ControlTooltip label={t("addBookmark")}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-3"
          onClick={() => handleOpenChange(true)}
          disabled={isLoading}
          aria-label={t("addBookmark")}
          aria-haspopup="dialog"
        >
          <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
          <span className="text-xs font-medium">{t("bookmark")}</span>
        </Button>
      </ControlTooltip>
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          <DrawerHeader className="border-b">
            <DrawerTitle className="flex items-center gap-2">
              <BookmarkPlus className="h-5 w-5" aria-hidden="true" />
              {t("addBookmark")}
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-4">
            {captured && (
              <BookmarkForm
                audiobookId={captured.audiobookId}
                initialPosition={captured.position}
                duration={max}
                onSaved={() => handleOpenChange(false)}
                onCancel={() => handleOpenChange(false)}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
