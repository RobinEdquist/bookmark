"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ExternalLink, Unlink, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useComicvineSeriesLink,
  useComicvineBookLink,
  useUnlinkSeries,
  useUnlinkBook,
} from "../../lib/use-comicvine";
import { useComicBook, useUpdateComicBook } from "../../lib/use-comics";
import type { ComicCreatorRole } from "../../lib/use-comics";

interface ComicvineLinkCardProps {
  level: "series" | "book";
  entityId: string;
}

// ---------------------------------------------------------------------------
// Role-mapping: CV role string → ComicCreatorRole
// ---------------------------------------------------------------------------
function mapCvRole(cvRole: string): ComicCreatorRole {
  const normalized = cvRole.toLowerCase().split(",")[0]?.trim() ?? "";
  if (normalized === "writer") return "writer";
  if (
    normalized === "penciler" ||
    normalized === "penciller" ||
    normalized === "pencils" ||
    normalized === "artist"
  )
    return "penciller";
  if (normalized === "inker" || normalized === "inks") return "inker";
  if (
    normalized === "colorist" ||
    normalized === "colourist" ||
    normalized === "colors" ||
    normalized === "colours"
  )
    return "colorist";
  if (normalized === "letterer" || normalized === "letters") return "letterer";
  if (
    normalized === "cover" ||
    normalized === "cover artist" ||
    normalized === "coverartist"
  )
    return "cover_artist";
  if (normalized === "editor") return "editor";
  return "other";
}

// ---------------------------------------------------------------------------
// Series card
// ---------------------------------------------------------------------------

function ComicvineSeriesLinkCard({ entityId }: { entityId: string }) {
  const t = useTranslations("comicvine.linkCard");
  const { link, isLoading } = useComicvineSeriesLink(entityId);
  const { unlinkSeries, isUnlinking } = useUnlinkSeries();

  const handleUnlink = async () => {
    try {
      await unlinkSeries({ seriesId: entityId });
      toast.success(t("toast.unlinked"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.unlinkFailed"));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!link) {
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("titleSeries")}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={isUnlinking}
            className="h-8 text-muted-foreground hover:text-destructive"
          >
            <Unlink className="h-4 w-4 mr-1" />
            {isUnlinking ? t("unlinking") : t("unlink")}
          </Button>
        </div>
        <CardDescription>{t("descriptionSeries")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Info row */}
        <div className="flex items-start gap-4">
          {/* Cover thumbnail */}
          {link.imageUrl && (
            <Image
              src={link.imageUrl}
              alt={link.name}
              width={64}
              height={96}
              className="flex-shrink-0 rounded-md object-contain max-h-24"
              unoptimized
            />
          )}

          {/* Metadata */}
          <div className="flex-1 min-w-0 py-0.5">
            <h4 className="font-medium line-clamp-2">{link.name}</h4>

            <div className="mt-1.5 space-y-0.5">
              {link.publisherName && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t("publisher")}:</span>{" "}
                  {link.publisherName}
                </p>
              )}
              {link.startYear != null && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t("startYear")}:</span>{" "}
                  {link.startYear}
                </p>
              )}
              {link.countOfIssues != null && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">{t("issueCount")}:</span>{" "}
                  {link.countOfIssues}
                </p>
              )}
            </div>

            {link.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                {link.description}
              </p>
            )}
          </div>
        </div>

        {/* Attribution — required by ComicVine ToS */}
        {link.siteDetailUrl && (
          <a
            href={link.siteDetailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            {t("viewOnComicVine")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {!link.siteDetailUrl && (
          <p className="text-xs text-muted-foreground">{t("attribution")}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Book card
// ---------------------------------------------------------------------------

function ComicvineBookLinkCard({ entityId }: { entityId: string }) {
  const t = useTranslations("comicvine.linkCard");
  const { data, isLoading } = useComicvineBookLink(entityId);
  const { unlinkBook, isUnlinking } = useUnlinkBook();

  // For the creator quick-add we need the current book data
  const { data: bookData } = useComicBook(entityId);
  const updateBook = useUpdateComicBook();

  const [addingCreator, setAddingCreator] = useState<string | null>(null); // tracks "name|role" being added

  const link = data?.link ?? null;

  const handleUnlink = async () => {
    try {
      await unlinkBook({ bookId: entityId });
      toast.success(t("toast.unlinked"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.unlinkFailed"));
    }
  };

  const handleAddCreator = async (cvName: string, cvRole: string) => {
    if (!bookData) return;

    const mappedRole = mapCvRole(cvRole);
    const key = `${cvName}|${mappedRole}`;
    setAddingCreator(key);

    try {
      const existingCreators = bookData.creators.map((c) => ({
        name: c.name,
        role: c.role,
      }));

      // Dedupe by name+role
      const alreadyExists = existingCreators.some(
        (c) => c.name === cvName && c.role === mappedRole
      );
      if (alreadyExists) {
        toast.success(t("toast.creatorAdded"));
        return;
      }

      const newCreators = [...existingCreators, { name: cvName, role: mappedRole }];

      await updateBook.mutateAsync({
        id: entityId,
        data: { creators: newCreators },
      });

      toast.success(t("toast.creatorAdded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.creatorFailed"));
    } finally {
      setAddingCreator(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner size="md" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!link) {
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("titleBook")}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUnlink}
            disabled={isUnlinking}
            className="h-8 text-muted-foreground hover:text-destructive"
          >
            <Unlink className="h-4 w-4 mr-1" />
            {isUnlinking ? t("unlinking") : t("unlink")}
          </Button>
        </div>
        <CardDescription>{t("descriptionBook")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Info row */}
        <div className="flex items-start gap-4">
          {/* Cover thumbnail — display-only */}
          {link.imageUrl && (
            <Image
              src={link.imageUrl}
              alt={link.name ?? `Issue #${link.issueNumber ?? ""}`}
              width={64}
              height={96}
              className="flex-shrink-0 rounded-md object-contain max-h-24"
              unoptimized
            />
          )}

          {/* Metadata */}
          <div className="flex-1 min-w-0 py-0.5">
            {link.issueNumber != null && (
              <p className="text-sm font-medium text-primary">
                #{link.issueNumber}
              </p>
            )}
            {link.name && (
              <h4 className="font-medium line-clamp-2">{link.name}</h4>
            )}
            {link.coverDate && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {link.coverDate}
              </p>
            )}
            {link.description && (
              <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                {link.description}
              </p>
            )}
          </div>
        </div>

        {/* Suggested creators */}
        {link.personCredits.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <Users className="h-3.5 w-3.5" />
              {t("suggestedCreators")}
            </div>
            <div className="flex flex-wrap gap-2">
              {link.personCredits.map((credit) => {
                const mappedRole = mapCvRole(credit.role);
                const key = `${credit.name}|${mappedRole}`;
                const isAdding = addingCreator === key;
                const alreadyAdded = bookData?.creators.some(
                  (c) => c.name === credit.name && c.role === mappedRole
                ) ?? false;

                return (
                  <div
                    key={key}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs"
                  >
                    <span className="text-foreground">{credit.name}</span>
                    <span className="text-muted-foreground">—</span>
                    <span className="text-muted-foreground">{credit.role}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-auto px-1.5 py-0 text-xs text-primary hover:text-primary/80"
                      disabled={isAdding || alreadyAdded || updateBook.isPending}
                      onClick={() => handleAddCreator(credit.name, credit.role)}
                    >
                      {alreadyAdded ? "✓" : t("addCreator")}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Attribution — required by ComicVine ToS */}
        {link.siteDetailUrl && (
          <a
            href={link.siteDetailUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            {t("viewOnComicVine")}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {!link.siteDetailUrl && (
          <p className="text-xs text-muted-foreground">{t("attribution")}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Public export — parameterized by level
// ---------------------------------------------------------------------------

export function ComicvineLinkCard({ level, entityId }: ComicvineLinkCardProps) {
  if (level === "series") {
    return <ComicvineSeriesLinkCard entityId={entityId} />;
  }
  return <ComicvineBookLinkCard entityId={entityId} />;
}
