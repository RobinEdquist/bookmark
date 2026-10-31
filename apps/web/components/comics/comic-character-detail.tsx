"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { ComicSeriesGrid } from "./comic-series-grid";
import { ComicCollectionGrid } from "./comic-collection-grid";
import { useComicCharacter } from "../../lib/use-comic-characters";

const BACK_HREF = "/comics?view=characters";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function ComicCharacterDetail({ id }: { id: string }) {
  const t = useTranslations("comics");
  const { data: character, isLoading, error } = useComicCharacter(id);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </main>
    );
  }

  if (error || !character) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-destructive">{t("characters.error")}</p>
        <Button variant="outline" asChild>
          <Link href={BACK_HREF} scroll={false}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("collections.tabCharacters")}
          </Link>
        </Button>
      </main>
    );
  }

  const seriesCount = character.soloSeries.length + character.teamUps.length;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-4">
          <Button variant="ghost" size="icon" asChild>
            <Link
              href={BACK_HREF}
              scroll={false}
              aria-label={t("characters.back")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-8">
        <motion.div
          className="space-y-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {character.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("collections.seriesCount", { count: seriesCount })}
            </p>
          </div>

          {seriesCount === 0 && (
            <p className="py-16 text-center text-muted-foreground">
              {t("characters.noSeries")}
            </p>
          )}

          {character.soloSeries.length > 0 && (
            <Section title={t("characters.solo")}>
              <ComicSeriesGrid series={character.soloSeries} />
            </Section>
          )}

          {character.teamUps.length > 0 && (
            <Section title={t("characters.teamUps")}>
              <ComicSeriesGrid series={character.teamUps} />
            </Section>
          )}

          {character.collections.length > 0 && (
            <Section title={t("characters.collections")}>
              <ComicCollectionGrid collections={character.collections} />
            </Section>
          )}
        </motion.div>
      </div>
    </main>
  );
}
