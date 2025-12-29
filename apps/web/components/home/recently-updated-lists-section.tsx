"use client";

import { useTranslations } from "next-intl";
import { useRecentLists } from "../../lib/use-lists";
import { HorizontalScrollRow } from "./horizontal-scroll-row";
import { ListCard } from "../lists/list-card";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export function RecentlyUpdatedListsSection() {
  const t = useTranslations("home.recentlyUpdatedLists");
  const { data, isLoading } = useRecentLists(12);

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
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

  if (!data?.lists.length) {
    return null;
  }

  return (
    <HorizontalScrollRow
      title={t("title")}
      seeAllHref="/lists"
      seeAllLabel={t("seeAll")}
    >
      {data.lists.map((list) => (
        <div key={list.id} className="w-40 shrink-0">
          <ListCard list={list} />
        </div>
      ))}
    </HorizontalScrollRow>
  );
}
