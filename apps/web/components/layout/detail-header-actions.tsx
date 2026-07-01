"use client";

import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";

export interface DetailHeaderAction {
  /** Stable key for React lists. */
  key: string;
  /** Accessible label / menu item text / desktop tooltip. */
  label: string;
  /** Icon element (lucide icon or next/image). Sized automatically per context. */
  icon: React.ReactNode;
  onClick: () => void;
  /** Render the mobile menu item with destructive styling. */
  destructive?: boolean;
}

interface DetailHeaderActionsProps {
  actions: DetailHeaderAction[];
}

/**
 * Renders detail-page header actions responsively:
 * - Desktop (lg+): inline ghost icon buttons, matching the surrounding header layout.
 * - Mobile: a single overflow ("⋯") menu so the header never overflows horizontally.
 *   A single action stays inline instead of hiding behind a menu.
 */
export function DetailHeaderActions({ actions }: DetailHeaderActionsProps) {
  const t = useTranslations("common");

  if (actions.length === 0) return null;

  return (
    <>
      {/* Desktop: inline icon buttons. `lg:contents` lets the buttons inherit
          the parent header's flex gap so spacing matches other header controls. */}
      <div className="hidden lg:contents">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant="ghost"
            size="icon"
            onClick={action.onClick}
            title={action.label}
            aria-label={action.label}
          >
            {action.icon}
          </Button>
        ))}
      </div>

      {/* Mobile: single overflow menu (or a lone inline button). */}
      {actions.length === 1 ? (
        <div className="lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={actions[0]!.onClick}
            title={actions[0]!.label}
            aria-label={actions[0]!.label}
          >
            {actions[0]!.icon}
          </Button>
        </div>
      ) : (
        <div className="lg:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("moreActions")}>
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((action) => (
                <DropdownMenuItem
                  key={action.key}
                  onSelect={action.onClick}
                  className={
                    action.destructive
                      ? "text-destructive focus:text-destructive"
                      : undefined
                  }
                >
                  <span className="flex size-4 shrink-0 items-center justify-center [&_img]:size-4 [&_svg]:size-4">
                    {action.icon}
                  </span>
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </>
  );
}
