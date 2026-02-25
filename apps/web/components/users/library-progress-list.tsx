"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

import { useLibraryProgress } from "../../lib/use-user-profile";

const PAGE_SIZE = 20;

interface LibraryProgressListProps {
  userId: string;
}

type TypeFilter = "" | "audiobook" | "ebook";
type StatusFilter = "" | "in_progress" | "completed";
type SortOption = "recent" | "progress" | "title";

export function LibraryProgressList({ userId }: LibraryProgressListProps) {
  const t = useTranslations("userProfile.libraryProgress");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [sort, setSort] = useState<SortOption>("recent");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useLibraryProgress(userId, {
    limit: PAGE_SIZE,
    offset,
    type: typeFilter || undefined,
    status: statusFilter || undefined,
    sort,
  });

  const handleTypeChange = (value: TypeFilter) => {
    setTypeFilter(value);
    setOffset(0);
  };

  const handleStatusChange = (value: StatusFilter) => {
    setStatusFilter(value);
    setOffset(0);
  };

  const handleSortChange = (value: SortOption) => {
    setSort(value);
    setOffset(0);
  };

  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        {/* Type filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("filterType")}:</span>
          {([
            { value: "" as TypeFilter, label: t("all") },
            { value: "audiobook" as TypeFilter, label: t("audiobooks") },
            { value: "ebook" as TypeFilter, label: t("ebooks") },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleTypeChange(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                typeFilter === opt.value
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("filterStatus")}:</span>
          {([
            { value: "" as StatusFilter, label: t("all") },
            { value: "in_progress" as StatusFilter, label: t("inProgress") },
            { value: "completed" as StatusFilter, label: t("completed") },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleStatusChange(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                statusFilter === opt.value
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{t("sort")}:</span>
          {([
            { value: "recent" as SortOption, label: t("sortRecent") },
            { value: "progress" as SortOption, label: t("sortProgress") },
            { value: "title" as SortOption, label: t("sortTitle") },
          ]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSortChange(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                sort === opt.value
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((item) => {
              const href =
                item.type === "audiobook"
                  ? `/audiobooks/${item.id}`
                  : `/ebooks/${item.id}`;

              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={href}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
                >
                  {/* Cover thumbnail */}
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded">
                    {item.coverUrl ? (
                      <Image
                        src={item.coverUrl}
                        alt={item.title}
                        fill
                        className="object-cover"
                        unoptimized={item.coverUrl.startsWith("/api/")}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-sm">
                        {item.type === "audiobook" ? "🎧" : "📖"}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          item.type === "audiobook"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.type === "audiobook" ? "Audio" : "Ebook"}
                      </span>
                    </div>
                    {item.authorName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {item.authorName}
                      </p>
                    )}
                  </div>

                  {/* Progress */}
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, Math.round(item.progressPercent))}%`,
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.completed
                        ? t("completedLabel")
                        : t("progressLabel", {
                            percent: Math.round(item.progressPercent),
                          })}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                {t("pageInfo", {
                  start: offset + 1,
                  end: Math.min(offset + PAGE_SIZE, total),
                  total,
                })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                >
                  {t("previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                >
                  {t("next")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
