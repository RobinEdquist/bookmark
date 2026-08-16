"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BookOpen, ExternalLink, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";
import type {
  GapFixMethod,
  MetadataGapCount,
  MetadataGapItem,
} from "../../lib/use-metadata-gaps";

interface MetadataGapsTableProps {
  items: MetadataGapItem[];
  /** Summary entries, used to colour each badge by how the gap gets fixed. */
  gapCounts: MetadataGapCount[];
  detailHref: (item: MetadataGapItem) => string;
  onEdit: (item: MetadataGapItem) => void;
  onLinkHardcover: (item: MetadataGapItem) => void;
  onLinkGoodreads: (item: MetadataGapItem) => void;
}

const BADGE_STYLES: Record<GapFixMethod, string> = {
  link: "border-primary/30 bg-primary/10 text-primary",
  manual: "border-border bg-muted text-muted-foreground",
  file: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function MetadataGapsTable({
  items,
  gapCounts,
  detailHref,
  onEdit,
  onLinkHardcover,
  onLinkGoodreads,
}: MetadataGapsTableProps) {
  const t = useTranslations("admin.metadata");

  const fixMethodOf = (key: string): GapFixMethod =>
    gapCounts.find((gap) => gap.key === key)?.fixableBy ?? "manual";

  if (items.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">
              {t("table.item")}
            </th>
            <th className="px-3 py-2 text-left font-medium">
              {t("table.missing")}
            </th>
            <th className="w-px px-3 py-2 text-right font-medium">
              {t("table.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b align-top hover:bg-muted/50">
              <td className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-muted">
                    {item.coverUrl ? (
                      <Image
                        src={item.coverUrl}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                        unoptimized={item.coverUrl.startsWith("/api/")}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <BookOpen
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden
                        />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={detailHref(item)}
                      className="block truncate font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                    {item.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {item.gaps.map((key) => (
                    <span
                      key={key}
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[11px]",
                        BADGE_STYLES[fixMethodOf(key)],
                      )}
                    >
                      {t(`gaps.${key}`)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(item)}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                    {t("actions.edit")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t("table.actions")}
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onLinkHardcover(item)}>
                        {t("actions.linkHardcover")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onLinkGoodreads(item)}>
                        {t("actions.linkGoodreads")}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={detailHref(item)}>
                          <ExternalLink
                            className="mr-2 h-3.5 w-3.5"
                            aria-hidden
                          />
                          {t("actions.open")}
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
