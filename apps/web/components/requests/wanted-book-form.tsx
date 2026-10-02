"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Button } from "@repo/ui/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import type {
  ContentType,
  CreateRequestParams,
  RequestResponse,
} from "../../lib/use-requests";

interface Props {
  initialTitle: string;
  contentType: "all" | "audiobooks" | "ebooks" | "comics";
  onRequest: (
    request: CreateRequestParams,
  ) => Promise<RequestResponse | undefined>;
  isRequesting: boolean;
}

export function WantedBookForm({
  initialTitle,
  contentType,
  onRequest,
  isRequesting,
}: Props) {
  const t = useTranslations("requests");
  const [title, setTitle] = useState(initialTitle);
  const [author, setAuthor] = useState("");
  const [medium, setMedium] = useState<ContentType>("audiobook");
  const selectedMedium =
    contentType === "all"
      ? medium
      : contentType === "audiobooks"
        ? "audiobook"
        : contentType === "ebooks"
          ? "ebook"
          : "comics";

  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-medium">
        {t("wanted.title")}
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const request = await onRequest({
            title: title.trim(),
            author: author.trim() || undefined,
            contentType: selectedMedium,
          });
          if (request) {
            setTitle("");
            setAuthor("");
          }
        }}
      >
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("wanted.description")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="wanted-title">{t("wanted.bookTitle")}</Label>
            <Input
              id="wanted-title"
              required
              maxLength={500}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wanted-author">{t("wanted.author")}</Label>
            <Input
              id="wanted-author"
              maxLength={500}
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
            />
          </div>
        </div>
        {contentType === "all" && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              {t("filters.contentType.label")}
            </legend>
            <RadioGroup
              value={medium}
              onValueChange={(value) => setMedium(value as ContentType)}
              className="flex flex-wrap gap-4"
            >
              {(["audiobook", "ebook", "comics"] as const).map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <RadioGroupItem id={`wanted-${value}`} value={value} />
                  <Label htmlFor={`wanted-${value}`}>
                    {t(`badge.${value}`)}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        )}
        <p className="text-xs text-muted-foreground">
          {t("wanted.languageHint")}
        </p>
        <Button type="submit" disabled={isRequesting || !title.trim()}>
          {isRequesting ? <LoadingSpinner size="sm" /> : t("button.request")}
        </Button>
      </form>
    </details>
  );
}
