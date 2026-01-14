"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/ui/tooltip";
import { EpubReader } from "./epub-reader";
import { useEbookProgress } from "../../lib/use-ebook-progress";
import { useTranslations } from "next-intl";

interface ReadButtonProps {
  ebookId: string;
  ebookTitle: string;
  format: string;
}

export function ReadButton({ ebookId, ebookTitle, format }: ReadButtonProps) {
  const t = useTranslations("ebooks");
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const { data: progress } = useEbookProgress(ebookId);

  const isEpub = format.toLowerCase() === "epub";
  const hasProgress = progress && progress.progressPercent > 0;

  if (isReaderOpen) {
    return (
      <EpubReader
        ebookId={ebookId}
        ebookTitle={ebookTitle}
        initialCfi={progress?.cfi}
        onClose={() => setIsReaderOpen(false)}
      />
    );
  }

  const button = (
    <Button
      size="lg"
      className="w-full"
      onClick={() => setIsReaderOpen(true)}
      disabled={!isEpub}
    >
      <BookOpen className="mr-2 h-5 w-5" />
      {hasProgress ? t("detail.continueReading") : t("detail.read")}
    </Button>
  );

  if (!isEpub) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <p>{t("detail.readNotSupported")}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}
