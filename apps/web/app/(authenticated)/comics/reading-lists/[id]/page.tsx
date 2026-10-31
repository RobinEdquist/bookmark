"use client";

import { use } from "react";
import { ReadingListDetail } from "../../../../../components/reading-lists/reading-list-detail";

export default function ComicReadingListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <ReadingListDetail
      id={id}
      backHref="/comics?view=reading-lists"
      itemHref={(entry) => `/comics/${entry.seriesId}/books/${entry.id}`}
    />
  );
}
