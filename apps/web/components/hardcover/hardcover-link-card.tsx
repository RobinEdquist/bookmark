"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Star, ExternalLink, Unlink, BookOpen, Tag, Heart } from "lucide-react";
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
  useHardcoverLink,
  useHardcoverUnlinkMedia,
  type MediaType,
} from "../../lib/use-hardcover";

interface HardcoverLinkCardProps {
  mediaType: MediaType;
  mediaId: string;
}

export function HardcoverLinkCard({ mediaType, mediaId }: HardcoverLinkCardProps) {
  const t = useTranslations("common.hardcoverLink");
  const { link, isLoading } = useHardcoverLink(mediaType, mediaId);
  const { unlinkMedia, isUnlinking } = useHardcoverUnlinkMedia();

  const handleUnlink = async () => {
    try {
      await unlinkMedia({ mediaType, mediaId });
      toast.success(t("toast.unlinked"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toast.unlinkFailed")
      );
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

  const rating = link.rating ? parseFloat(link.rating) : null;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Image
              src="/hardcover.svg"
              alt="Hardcover"
              width={20}
              height={20}
            />
            {t("title")}
          </CardTitle>
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
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Book info row */}
        <div className="flex gap-4">
          {/* Cover thumbnail */}
          {link.imageUrl && (
            <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-muted">
              <Image
                src={link.imageUrl}
                alt={link.title}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          )}

          {/* Title and metadata */}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium line-clamp-2">{link.title}</h4>

            {link.authorNames.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
                {link.authorNames.join(", ")}
              </p>
            )}

            {link.featuredSeriesName && (
              <p className="text-sm text-primary mt-0.5">
                {link.featuredSeriesName}
                {link.featuredSeriesPosition && ` #${link.featuredSeriesPosition}`}
              </p>
            )}

            {/* Rating */}
            {rating !== null && rating > 0 && (
              <div className="flex items-center gap-1.5 mt-2">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                <span className="text-sm font-medium">{rating.toFixed(1)}</span>
                {link.ratingsCount && link.ratingsCount > 0 && (
                  <span className="text-sm text-muted-foreground">
                    ({link.ratingsCount.toLocaleString()} {t("ratings")})
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Genres */}
        {link.genres.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {t("genres")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {link.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Moods */}
        {link.moods.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Heart className="h-3.5 w-3.5" />
              {t("moods")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {link.moods.map((mood) => (
                <span
                  key={mood}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  {mood}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {link.tags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              <Tag className="h-3.5 w-3.5" />
              {t("tags")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {link.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Content warnings */}
        {link.contentWarnings.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
              {t("contentWarnings")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {link.contentWarnings.map((warning) => (
                <span
                  key={warning}
                  className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"
                >
                  {warning}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* View on Hardcover link */}
        <a
          href={`https://hardcover.app/books/${link.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          {t("viewOnHardcover")}
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  );
}
