"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useAudiobooks } from "../../lib/use-audiobooks";
import { useMyPermissions } from "../../lib/use-users";
import { HorizontalScrollRow } from "./horizontal-scroll-row";
import { AudiobookCard } from "../audiobooks/audiobook-card";
import { EditAudiobookDialog } from "../audiobooks/edit-audiobook-dialog";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function RecentlyAddedSection() {
  const t = useTranslations("home.recentlyAdded");
  const { data: permissions } = useMyPermissions();
  const canEdit = permissions?.canEditMetadata ?? false;
  const { data, isLoading } = useAudiobooks({
    sortBy: "createdAt",
    sortOrder: "desc",
    limit: 12,
  });

  // Shared edit dialog state for navigation between audiobooks
  const [editingAudiobookId, setEditingAudiobookId] = useState<string | null>(
    null
  );
  const audiobooks = data?.audiobooks ?? [];
  const editingAudiobook = editingAudiobookId
    ? (audiobooks.find((a) => a.id === editingAudiobookId) ?? null)
    : null;
  const audiobookIds = audiobooks.map((a) => a.id);

  const handleOpenEdit = useCallback((audiobookId: string) => {
    setEditingAudiobookId(audiobookId);
  }, []);

  const handleNavigate = useCallback((audiobookId: string) => {
    setEditingAudiobookId(audiobookId);
  }, []);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-20" />
        </div>
        <div className="flex gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="w-40 shrink-0">
              <Skeleton className="aspect-square rounded-xl" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!data?.audiobooks.length) {
    return null;
  }

  return (
    <>
      <HorizontalScrollRow
        title={t("title")}
        seeAllHref="/audiobooks?sortBy=createdAt&sortOrder=desc"
        seeAllLabel={t("seeAll")}
      >
        {data.audiobooks.map((audiobook) => (
          <div key={audiobook.id} className="w-40 shrink-0">
            <AudiobookCard
              audiobook={audiobook}
              onEdit={() => handleOpenEdit(audiobook.id)}
              externalEditDialog
            />
          </div>
        ))}
      </HorizontalScrollRow>

      {/* Shared edit dialog with navigation */}
      {canEdit && (
        <EditAudiobookDialog
          audiobook={editingAudiobook}
          open={editingAudiobookId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingAudiobookId(null);
          }}
          audiobookIds={audiobookIds}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
}
