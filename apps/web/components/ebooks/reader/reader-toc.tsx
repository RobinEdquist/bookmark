"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/ui/sheet";
import { ScrollArea } from "@repo/ui/components/ui/scroll-area";
import { useTranslations } from "next-intl";

import type { ReaderTocItem } from "./types";

interface ReaderTocProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: ReaderTocItem[];
  onNavigate: (href: string) => void;
}

function TocList({
  items,
  depth,
  onNavigate,
}: {
  items: ReaderTocItem[];
  depth: number;
  onNavigate: (href: string) => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item, index) => (
        <li key={`${item.href}-${index}`}>
          <button
            type="button"
            className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => onNavigate(item.href)}
          >
            {item.label}
          </button>
          {item.subitems && item.subitems.length > 0 && (
            <TocList
              items={item.subitems}
              depth={depth + 1}
              onNavigate={onNavigate}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

export function ReaderToc({
  open,
  onOpenChange,
  items,
  onNavigate,
}: ReaderTocProps) {
  const t = useTranslations("ebooks");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-base">{t("reader.contents")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-57px)] px-2 py-2">
          <TocList items={items} depth={0} onNavigate={onNavigate} />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
