"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import {
  useRemoveEbookFromGroup,
  useReorderEbookGroup,
  useUpdateEbookGroupMember,
  type EbookGroupMember,
} from "../../lib/use-ebook-groups";
import { GeneratedCover } from "../common/generated-cover";

function moveIds(ids: string[], index: number, direction: -1 | 1): string[] {
  const next = index + direction;
  const item = ids[index];
  if (item === undefined || next < 0 || next >= ids.length) return ids;
  const copy = [...ids];
  copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

function RoleField({
  groupId,
  member,
}: {
  groupId: string;
  member: EbookGroupMember;
}) {
  const t = useTranslations("ebooks");
  const updateMember = useUpdateEbookGroupMember();
  const [value, setValue] = useState(member.role ?? "");

  return (
    <Input
      value={value}
      aria-label={t("groups.role")}
      placeholder={t("groups.rolePlaceholder")}
      disabled={updateMember.isPending}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const next = value.trim();
        const previous = member.role ?? "";
        if (next === previous) return;
        updateMember.mutate(
          {
            groupId,
            ebookId: member.id,
            role: next.length === 0 ? null : next,
          },
          {
            onSuccess: () => toast.success(t("groups.roleSaved")),
            onError: () => toast.error(t("groups.error")),
          },
        );
      }}
    />
  );
}

export function EbookGroupMembers({
  groupId,
  ebooks,
  canEdit,
}: {
  groupId: string;
  ebooks: EbookGroupMember[];
  canEdit: boolean;
}) {
  const t = useTranslations("ebooks");
  const reorder = useReorderEbookGroup();
  const removeEbook = useRemoveEbookFromGroup();

  const handleMove = async (index: number, direction: -1 | 1) => {
    const currentIds = ebooks.map((ebook) => ebook.id);
    const ebookIds = moveIds(currentIds, index, direction);
    if (ebookIds.join() === currentIds.join()) return;
    try {
      await reorder.mutateAsync({ groupId, ebookIds });
      toast.success(t("groups.orderSaved"));
    } catch {
      toast.error(t("groups.error"));
    }
  };

  const handleRemove = async (ebookId: string) => {
    try {
      await removeEbook.mutateAsync({ groupId, ebookId });
      toast.success(t("groups.removeSuccess"));
    } catch {
      toast.error(t("groups.error"));
    }
  };

  if (ebooks.length === 0) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        {t("groups.noMembers")}
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {ebooks.map((ebook, index) => {
        const authors = ebook.authors.join(", ");
        return (
          <li
            key={ebook.id}
            className="flex gap-3 rounded-xl border border-border/50 p-3"
          >
            <Link
              href={`/ebooks/${ebook.id}`}
              className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md bg-muted"
            >
              {ebook.coverUrl ? (
                <Image
                  src={ebook.coverUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized={ebook.coverUrl.startsWith("/api/")}
                />
              ) : (
                <GeneratedCover title={ebook.title} aria-hidden />
              )}
            </Link>
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <Link
                  href={`/ebooks/${ebook.id}`}
                  className="font-medium hover:underline"
                >
                  {ebook.title}
                </Link>
                {authors && (
                  <p className="truncate text-sm text-muted-foreground">
                    {authors}
                  </p>
                )}
                {ebook.status === "missing" && (
                  <p className="text-xs text-destructive">
                    {t("groups.fileMissing")}
                  </p>
                )}
              </div>
              {canEdit ? (
                <RoleField
                  key={`${ebook.id}:${ebook.role ?? ""}`}
                  groupId={groupId}
                  member={ebook}
                />
              ) : (
                ebook.role && (
                  <p className="text-sm text-muted-foreground">{ebook.role}</p>
                )
              )}
            </div>
            {canEdit && (
              <div className="flex shrink-0 flex-col">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("groups.moveEarlier")}
                  disabled={index === 0 || reorder.isPending}
                  onClick={() => void handleMove(index, -1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("groups.moveLater")}
                  disabled={index === ebooks.length - 1 || reorder.isPending}
                  onClick={() => void handleMove(index, 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("groups.removeEbook")}
                  className="text-muted-foreground hover:text-destructive"
                  disabled={removeEbook.isPending}
                  onClick={() => void handleRemove(ebook.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
