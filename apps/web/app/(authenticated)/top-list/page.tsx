"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, Star, Trophy } from "lucide-react";
import { type TopRatedListItem, useTopLists } from "../../../lib/use-lists";

function RankedItemsList({
  items,
  goodreadsLabel,
  hardcoverLabel,
  audiobookLabel,
  ebookLabel,
  unknownAuthor,
  votesLabel,
}: {
  items: TopRatedListItem[];
  goodreadsLabel: string;
  hardcoverLabel: string;
  audiobookLabel: string;
  ebookLabel: string;
  unknownAuthor: string;
  votesLabel: string;
}) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const itemHref =
          item.primaryVersionType === "audiobook"
            ? `/audiobooks/${item.primaryVersionId}`
            : `/ebooks/${item.primaryVersionId}`;
        const versions =
          item.versions.length > 0
            ? item.versions
            : [{ id: item.id, itemType: item.itemType, title: item.title }];
        const hasMultipleVersions = versions.length > 1;
        const versionCountByType = versions.reduce(
          (acc, version) => {
            acc[version.itemType] += 1;
            return acc;
          },
          { audiobook: 0, ebook: 0 }
        );
        const seenVersionByType = { audiobook: 0, ebook: 0 };
        const sourceLabel =
          item.ratingSource === "goodreads"
            ? goodreadsLabel
            : hardcoverLabel;

        return (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-lg border p-3"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {index + 1}
            </div>

            <Link href={itemHref} className="shrink-0">
              <div className="relative h-14 w-14 overflow-hidden rounded-md bg-muted">
                <Image
                  src={item.coverUrl}
                  alt={item.title}
                  fill
                  sizes="56px"
                  className="object-cover"
                  unoptimized
                />
              </div>
            </Link>

            <div className="min-w-0 flex-1">
              <Link href={itemHref} className="line-clamp-1 font-medium hover:underline">
                {item.title}
              </Link>
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {item.authors.length > 0 ? item.authors.join(", ") : unknownAuthor}
              </p>
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {hasMultipleVersions
                  ? versions
                      .map((version) =>
                        version.itemType === "audiobook" ? audiobookLabel : ebookLabel
                      )
                      .filter((value, position, array) => array.indexOf(value) === position)
                      .join(" + ")
                  : item.itemType === "audiobook"
                    ? audiobookLabel
                    : ebookLabel}
              </p>
              {hasMultipleVersions ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {versions.map((version) => {
                    seenVersionByType[version.itemType] += 1;
                    const baseLabel =
                      version.itemType === "audiobook" ? audiobookLabel : ebookLabel;
                    const sequenceLabel =
                      versionCountByType[version.itemType] > 1
                        ? ` ${seenVersionByType[version.itemType]}`
                        : "";
                    const versionHref =
                      version.itemType === "audiobook"
                        ? `/audiobooks/${version.id}`
                        : `/ebooks/${version.id}`;

                    return (
                      <Link
                        key={`${version.itemType}-${version.id}`}
                        href={versionHref}
                        className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                        title={version.title}
                      >
                        {baseLabel}
                        {sequenceLabel}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 text-right">
              <div className="flex items-center justify-end gap-1 text-sm font-semibold">
                <Star className="h-4 w-4 fill-current text-yellow-500" />
                {item.rating.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">
                {sourceLabel} • {item.ratingsCount.toLocaleString()} {votesLabel}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function TopListPage() {
  const t = useTranslations("lists.topList");
  const { data, isLoading } = useTopLists(10);

  return (
    <div className="flex flex-col p-4 lg:p-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 space-y-2">
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{t("title")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <section className="space-y-4 rounded-xl border p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{t("weightedTopTenTitle")}</h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("loading")}
            </div>
          ) : !data?.topRated.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <RankedItemsList
              items={data.topRated}
              goodreadsLabel={t("goodreadsLabel")}
              hardcoverLabel={t("hardcoverLabel")}
              audiobookLabel={t("audiobook")}
              ebookLabel={t("ebook")}
              unknownAuthor={t("unknownAuthor")}
              votesLabel={t("votes")}
            />
          )}
        </section>

        <section className="mt-6 space-y-4 rounded-xl border p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{t("mostVotesTitle")}</h2>

          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("loading")}
            </div>
          ) : !data?.mostVoted.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {t("empty")}
            </p>
          ) : (
            <RankedItemsList
              items={data.mostVoted}
              goodreadsLabel={t("goodreadsLabel")}
              hardcoverLabel={t("hardcoverLabel")}
              audiobookLabel={t("audiobook")}
              ebookLabel={t("ebook")}
              unknownAuthor={t("unknownAuthor")}
              votesLabel={t("votes")}
            />
          )}
        </section>
      </div>
    </div>
  );
}
