"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useInfiniteEbooks } from "../../lib/use-ebooks";
import { useAddEbookToGroup } from "../../lib/use-ebook-groups";

function AddEbookBody({
  groupId,
  memberIds,
  onClose,
}: {
  groupId: string;
  memberIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("ebooks");
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const {
    data,
    isFetching,
    hasNextPage,
    fetchNextPage,
    error,
    isFetchNextPageError,
    refetch,
  } = useInfiniteEbooks({ search: debounced || undefined });
  const addEbook = useAddEbookToGroup();
  const members = new Set(memberIds);
  const ebooks = (data?.pages.flatMap((page) => page.ebooks) ?? []).filter(
    (ebook) => !members.has(ebook.id),
  );

  const handlePick = async (ebookId: string) => {
    try {
      await addEbook.mutateAsync({
        groupId,
        ebookId,
        role: role.trim() ? role.trim() : undefined,
      });
      toast.success(t("groups.addSuccess"));
      onClose();
    } catch {
      toast.error(t("groups.error"));
    }
  };

  return (
    <>
      <div className="space-y-3 py-2">
        <div className="space-y-2">
          <Label htmlFor="group-ebook-search">{t("groups.addEbook")}</Label>
          <Input
            id="group-ebook-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("groups.searchEbooks")}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-ebook-role">{t("groups.role")}</Label>
          <Input
            id="group-ebook-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder={t("groups.rolePlaceholder")}
          />
        </div>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {ebooks.map((ebook) => (
            <li key={ebook.id}>
              <button
                type="button"
                onClick={() => void handlePick(ebook.id)}
                disabled={addEbook.isPending}
                className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                <span className="font-medium">{ebook.title}</span>
                {ebook.authors[0] && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {ebook.authors.map((author) => author.name).join(", ")}
                  </span>
                )}
              </button>
            </li>
          ))}
          {!isFetching && !error && !hasNextPage && ebooks.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t("groups.noEbooks")}
            </li>
          )}
        </ul>
        {error && (
          <div role="alert" className="space-y-2 text-sm">
            <p>{t("groups.loadError")}</p>
            <Button
              type="button"
              variant="outline"
              disabled={isFetching}
              onClick={() =>
                void (isFetchNextPageError ? fetchNextPage() : refetch())
              }
            >
              {t("groups.retry")}
            </Button>
          </div>
        )}
        {hasNextPage && !error && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isFetching || addEbook.isPending}
            onClick={() => void fetchNextPage()}
          >
            {t("groups.loadMore")}
          </Button>
        )}
        {isFetching && (
          <p role="status" className="text-sm text-muted-foreground">
            {t("groups.loading")}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("groups.cancel")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AddEbookToGroupDialog({
  open,
  onOpenChange,
  groupId,
  memberIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  memberIds: string[];
}) {
  const t = useTranslations("ebooks");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("groups.addEbook")}</DialogTitle>
        </DialogHeader>
        {open ? (
          <AddEbookBody
            groupId={groupId}
            memberIds={memberIds}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
