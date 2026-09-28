"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import { useMyPermissions } from "../../lib/use-users";
import { useInfiniteEbookGroups } from "../../lib/use-ebook-groups";
import { EbookGroupGrid } from "./ebook-group-grid";
import { CreateEbookGroupDialog } from "./create-ebook-group-dialog";

export function EbookGroupsView({
  search,
  animateEntrance = true,
}: {
  search: string;
  animateEntrance?: boolean;
}) {
  const t = useTranslations("ebooks");
  const { data: permissions } = useMyPermissions();
  const canEdit = permissions?.canEditMetadata ?? false;
  const [createOpen, setCreateOpen] = useState(false);
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEbookGroups({ search: search || undefined });
  const groups = data?.pages.flatMap((page) => page.groups) ?? [];

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex justify-end">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            {t("groups.create")}
          </Button>
        </div>
      )}
      <EbookGroupGrid
        groups={groups}
        isLoading={isLoading && !data}
        error={error}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => fetchNextPage()}
        animateEntrance={animateEntrance}
      />
      {canEdit && (
        <CreateEbookGroupDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </>
  );
}
