"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useTranslations } from "next-intl";

import { useEbookProgress } from "../../lib/use-ebook-progress";

export const READABLE_FORMATS = new Set([
  "epub",
  "pdf",
  "mobi",
  "azw3",
  "fb2",
  "cbz",
]);

interface ReadButtonProps {
  ebookId: string;
  ebookTitle: string;
  format: string;
}

export function ReadButton({ ebookId, format }: ReadButtonProps) {
  const t = useTranslations("ebooks");
  const { data: progress } = useEbookProgress(ebookId);

  if (!READABLE_FORMATS.has(format.toLowerCase())) {
    return null;
  }

  const inProgress =
    !!progress && progress.progressPercent > 0 && !progress.completed;

  return (
    <Button asChild size="lg" className="w-full">
      <Link href={`/ebooks/${ebookId}/read`}>
        <BookOpen className="mr-2 h-5 w-5" />
        {inProgress
          ? t("reader.continueReading", {
              percent: progress.progressPercent,
            })
          : t("reader.read")}
      </Link>
    </Button>
  );
}
