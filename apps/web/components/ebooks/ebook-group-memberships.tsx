"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/ui/button";
import { sectionByRole } from "../../lib/section-by-role";
import type { EbookDetailGroup } from "../../lib/use-ebook-groups";
import { GeneratedCover } from "../common/generated-cover";

function MemberLink({
  id,
  title,
  coverUrl,
  authors,
}: {
  id: string;
  title: string;
  coverUrl: string | null;
  authors: string[];
}) {
  const authorLine = authors.join(", ");
  return (
    <Link
      href={`/ebooks/${id}`}
      className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted"
    >
      <span className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-muted">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt=""
            fill
            className="object-cover"
            sizes="32px"
            unoptimized={coverUrl.startsWith("/api/")}
          />
        ) : (
          <GeneratedCover title={title} aria-hidden />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{title}</span>
        {authorLine && (
          <span className="block truncate text-xs text-muted-foreground">
            {authorLine}
          </span>
        )}
      </span>
    </Link>
  );
}

export function EbookGroupMemberships({
  groups,
  canEdit,
  onAdd,
}: {
  groups: EbookDetailGroup[];
  canEdit: boolean;
  onAdd: () => void;
}) {
  const t = useTranslations("ebooks");
  if (groups.length === 0 && !canEdit) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{t("groups.heading")}</h3>
        {canEdit && (
          <Button type="button" variant="outline" size="sm" onClick={onAdd}>
            {t("groups.addToGroup")}
          </Button>
        )}
      </div>
      {groups.map((group) => {
        const sections = sectionByRole(group.members);
        const hasLabeledRole = sections.some((section) => section.role);
        return (
          <div key={group.id} className="space-y-3">
            <div>
              <Link
                href={`/ebooks/groups/${group.id}`}
                className="font-medium hover:underline"
              >
                {group.name}
              </Link>
              {group.role && (
                <p className="text-sm text-muted-foreground">
                  {t("groups.thisBook", { role: group.role })}
                </p>
              )}
            </div>
            {sections.map((section) => (
              <div key={section.role ?? "unlabeled"}>
                {(section.role || hasLabeledRole) && (
                  <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {section.role ?? t("groups.unlabeled")}
                  </h4>
                )}
                <ul>
                  {section.members.map((member) => (
                    <li key={member.id}>
                      <MemberLink
                        id={member.id}
                        title={member.title}
                        coverUrl={member.coverUrl}
                        authors={member.authors}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
