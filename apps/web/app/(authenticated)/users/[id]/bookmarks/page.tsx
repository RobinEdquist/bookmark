"use client";

import { use } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import { AllBookmarksList } from "../../../../../components/users/bookmarks-list";

/**
 * Full list of the audiobooks a user has bookmarks in — the "See all" target
 * behind the profile page's capped bookmarks section.
 */
export default function UserBookmarksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("userProfile.bookmarks");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="space-y-2">
        <Link
          href={`/users/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToProfile")}
        </Link>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </div>

      <AllBookmarksList userId={id} />
    </div>
  );
}
