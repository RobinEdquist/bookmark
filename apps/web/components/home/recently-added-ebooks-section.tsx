"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useEbooks } from "../../lib/use-ebooks";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { useMyPermissions } from "../../lib/use-users";
import { HorizontalScrollRow } from "./horizontal-scroll-row";
import { EbookCard } from "../ebooks/ebook-card";
import { EditEbookDialog } from "../ebooks/edit-ebook-dialog";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function RecentlyAddedEbooksSection() {
  const t = useTranslations("home.recentlyAddedEbooks");
  const { data: permissions } = useMyPermissions();
  const { data: availability } = useLibraryAvailability();
  const canEdit = permissions?.canEditMetadata ?? false;

  const { data, isLoading } = useEbooks({
    sortBy: "createdAt",
    sortOrder: "desc",
    limit: 12,
  });

  // Shared edit dialog state for navigation between ebooks
  const [editingEbookId, setEditingEbookId] = useState<string | null>(null);
  const ebooks = data?.ebooks ?? [];
  const editingEbook = editingEbookId
    ? (ebooks.find((e) => e.id === editingEbookId) ?? null)
    : null;
  const ebookIds = ebooks.map((e) => e.id);

  const handleOpenEdit = useCallback((ebookId: string) => {
    setEditingEbookId(ebookId);
  }, []);

  const handleNavigate = useCallback((ebookId: string) => {
    setEditingEbookId(ebookId);
  }, []);

  // Don't show section if ebooks library is not configured
  if (!availability?.ebooks) {
    return null;
  }

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
              <Skeleton className="aspect-[2/3] rounded-xl" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (!data?.ebooks.length) {
    return null;
  }

  return (
    <>
      <HorizontalScrollRow
        title={t("title")}
        seeAllHref="/ebooks?sortBy=createdAt&sortOrder=desc"
        seeAllLabel={t("seeAll")}
      >
        {data.ebooks.map((ebook) => (
          <div key={ebook.id} className="w-40 shrink-0">
            <EbookCard
              ebook={ebook}
              onEdit={() => handleOpenEdit(ebook.id)}
              externalEditDialog
            />
          </div>
        ))}
      </HorizontalScrollRow>

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
