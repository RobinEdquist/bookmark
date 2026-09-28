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
import {
  useAddEbookToGroup,
  useCreateEbookGroup,
  useInfiniteEbookGroups,
} from "../../lib/use-ebook-groups";

function AddToEbookGroupBody({
  ebookId,
  onClose,
}: {
  ebookId: string;
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
  } = useInfiniteEbookGroups({ search: debounced || undefined });
  const createGroup = useCreateEbookGroup();
  const addEbook = useAddEbookToGroup();
  const groups = data?.pages.flatMap((page) => page.groups) ?? [];
  const isPending = createGroup.isPending || addEbook.isPending;
  const roleValue = role.trim() ? role.trim() : undefined;

  const handlePick = async (groupId: string) => {
    try {
      await addEbook.mutateAsync({ groupId, ebookId, role: roleValue });
      toast.success(t("groups.addSuccess"));
      onClose();
    } catch {
      toast.error(t("groups.error"));
    }
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;

    let created: { id: string };
    try {
      created = await createGroup.mutateAsync({ name });
    } catch {
      toast.error(t("groups.error"));
      return;
    }

    // The group now exists. If the membership write fails we must not leave the
    // reader thinking nothing happened — say so by name and keep the dialog
    // open, where the refetched list shows the new group to retry against.
    try {
      await addEbook.mutateAsync({
        groupId: created.id,
        ebookId,
        role: roleValue,
      });
    } catch {
      toast.error(t("groups.createdNotAdded", { name }));
      return;
    }

    toast.success(t("groups.createSuccess"));
    onClose();
  };

  return (
    <>
      <div className="space-y-3 py-2">
        <div className="space-y-2">
          <Label htmlFor="ebook-group-search">{t("groups.name")}</Label>
          <Input
            id="ebook-group-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("groups.searchPlaceholder")}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ebook-group-role">{t("groups.role")}</Label>
          <Input
            id="ebook-group-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder={t("groups.rolePlaceholder")}
          />
        </div>
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {groups.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => void handlePick(group.id)}
                disabled={isPending}
                className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
              >
                <span className="font-medium">{group.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {t("groups.ebookCount", { count: group.ebookCount })}
                </span>
              </button>
            </li>
          ))}
          {!isFetching && !error && !hasNextPage && groups.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {t("groups.noGroups")}
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
            disabled={isFetching || isPending}
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
        {query.trim().length > 0 && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isPending}
            onClick={() => void handleCreate()}
          >
            {t("groups.createNew", { name: query.trim() })}
          </Button>
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

export function AddToEbookGroupDialog({
  open,
  onOpenChange,
  ebookId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ebookId: string;
}) {
  const t = useTranslations("ebooks");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("groups.addTitle")}</DialogTitle>
        </DialogHeader>
        {open ? (
          <AddToEbookGroupBody
            ebookId={ebookId}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
