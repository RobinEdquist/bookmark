"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Headphones } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

import { useListeningHistory } from "../../lib/use-user-profile";

const PAGE_SIZE = 20;

interface SessionLogProps {
  userId: string;
}

function formatPosition(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSessionDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

export function SessionLog({ userId }: SessionLogProps) {
  const t = useTranslations("userProfile.listeningHistory");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useListeningHistory(userId, PAGE_SIZE, offset);

  const total = data?.total ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {data.items.map((session) => {
              const sessionDate = new Date(session.startedAt);
              const dateStr = sessionDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const timeStr = sessionDate.toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <Link
                  key={session.id}
                  href={`/audiobooks/${session.audiobookId}`}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent"
                >
                  {/* Cover */}
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
                    <Image
                      src={`/api/audiobooks/${session.audiobookId}/cover`}
                      alt={session.audiobookTitle}
                      fill
                      className="object-cover"
                      sizes="40px"
                      unoptimized
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <div className="absolute inset-0 flex h-full w-full items-center justify-center -z-10 text-muted-foreground">
                      <Headphones className="h-4 w-4" />
                    </div>
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {session.audiobookTitle}
                    </p>
                    {session.authorName && (
                      <p className="truncate text-xs text-muted-foreground">
                        {session.authorName}
                      </p>
                    )}
                  </div>

                  {/* Duration & position */}
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-xs font-medium">
                      {t("duration", {
                        duration: formatSessionDuration(session.durationSeconds),
                      })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("position", {
                        start: formatPosition(session.startPosition),
                        end: formatPosition(session.endPosition),
                      })}
                    </p>
                  </div>

                  {/* Date */}
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted-foreground">{dateStr}</p>
                    <p className="text-xs text-muted-foreground">{timeStr}</p>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {t("showing", {
                count: Math.min(offset + PAGE_SIZE, total),
                total,
              })}
            </span>
            {totalPages > 1 && (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
