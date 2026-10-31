"use client";

import { use } from "react";
import { ComicCharacterDetail } from "../../../../../components/comics/comic-character-detail";

export default function ComicCharacterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <ComicCharacterDetail id={id} />;
}
