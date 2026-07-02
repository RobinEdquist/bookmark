"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { AudiobookCard } from "./audiobook-card";
import { EditAudiobookDialog } from "./edit-audiobook-dialog";
import { useMyPermissions } from "../../lib/use-users";
import { useIntersectionObserver } from "../../lib/use-intersection-observer";
import type { AudiobookListItem } from "../../lib/use-audiobooks";

interface AudiobookGridProps {
  audiobooks: AudiobookListItem[];
  isLoading?: boolean;
  error?: Error | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  /** Disable the entrance animation, e.g. when restoring a scroll position. */
  animateEntrance?: boolean;
}

function AudiobookSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-square animate-pulse rounded-xl bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("audiobooks.empty");

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className="mb-4 text-6xl"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        📚
      </motion.div>
      <h3 className="text-lg font-medium">{t("title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
    </motion.div>
  );
}

export function AudiobookGrid({
  audiobooks,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  animateEntrance = true,
}: AudiobookGridProps) {
  const t = useTranslations("audiobooks");
  const { data: permissions } = useMyPermissions();
  const canEdit = permissions?.canEditMetadata ?? false;

  // Intersection observer for infinite scroll
  const loadMoreRef = useIntersectionObserver(
    () => {
      if (hasNextPage && !isFetchingNextPage && onLoadMore) {
        onLoadMore();
      }
    },
    { enabled: hasNextPage && !isFetchingNextPage }
  );

  // Shared edit dialog state for navigation between audiobooks
  const [editingAudiobookId, setEditingAudiobookId] = useState<string | null>(null);
  const editingAudiobook = editingAudiobookId
    ? audiobooks.find((a) => a.id === editingAudiobookId) ?? null
    : null;
  const audiobookIds = audiobooks.map((a) => a.id);

  const handleOpenEdit = useCallback((audiobookId: string) => {
    setEditingAudiobookId(audiobookId);
  }, []);

  const handleNavigate = useCallback((audiobookId: string) => {
    setEditingAudiobookId(audiobookId);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-destructive">{t("error")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <AudiobookSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (audiobooks.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      <motion.div
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-6"
        initial={animateEntrance ? "hidden" : false}
        animate="visible"
        variants={{
          hidden: {},
          visible: {
            transition: {
              staggerChildren: 0.05,
            },
          },
        }}
      >
        {audiobooks.map((audiobook) => (
          <AudiobookCard
            key={audiobook.id}
            audiobook={audiobook}
            onEdit={() => handleOpenEdit(audiobook.id)}
            externalEditDialog
            animateEntrance={animateEntrance}
          />
        ))}
      </motion.div>

      {/* Infinite scroll sentinel */}
      {hasNextPage && (
        <div
          ref={loadMoreRef}
          className="flex items-center justify-center py-8"
        >
          {isFetchingNextPage && (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

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
