"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { EbookCard } from "./ebook-card";
import { EditEbookDialog } from "./edit-ebook-dialog";
import { useMyPermissions } from "../../lib/use-users";
import { useIntersectionObserver } from "../../lib/use-intersection-observer";
import type { EbookListItem } from "../../lib/use-ebooks";

interface EbookGridProps {
  ebooks: EbookListItem[];
  isLoading?: boolean;
  error?: Error | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  /** Disable the entrance animation, e.g. when restoring a scroll position. */
  animateEntrance?: boolean;
}

function EbookSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
      <div className="mt-3 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("ebooks.empty");

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
        📖
      </motion.div>
      <h3 className="text-lg font-medium">{t("title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
    </motion.div>
  );
}

export function EbookGrid({
  ebooks,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  animateEntrance = true,
}: EbookGridProps) {
  const t = useTranslations("ebooks");
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

  // Shared edit dialog state for navigation between ebooks
  const [editingEbookId, setEditingEbookId] = useState<string | null>(null);
  const editingEbook = editingEbookId
    ? ebooks.find((e) => e.id === editingEbookId) ?? null
    : null;
  const ebookIds = ebooks.map((e) => e.id);

  const handleOpenEdit = useCallback((ebookId: string) => {
    setEditingEbookId(ebookId);
  }, []);

  const handleNavigate = useCallback((ebookId: string) => {
    setEditingEbookId(ebookId);
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
          <EbookSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (ebooks.length === 0) {
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
        {ebooks.map((ebook) => (
          <EbookCard
            key={ebook.id}
            ebook={ebook}
            onEdit={() => handleOpenEdit(ebook.id)}
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
        <EditEbookDialog
          ebook={editingEbook}
          open={editingEbookId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingEbookId(null);
          }}
          ebookIds={ebookIds}
          onNavigate={handleNavigate}
        />
      )}
    </>
  );
}
