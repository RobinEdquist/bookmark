"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Headphones } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@repo/ui/components/ui/button";

export function ContinueListeningSection() {
  const t = useTranslations("home.continueListening");

  // For now, always show empty state since playback isn't implemented
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>

      <motion.div
        className="flex flex-col items-center justify-center rounded-xl border bg-card p-8 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="mb-4 rounded-full bg-primary/10 p-4">
          <Headphones className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          {t("emptyDescription")}
        </p>
        <Button asChild className="mt-6">
          <Link href="/libraries">{t("browseLibrary")}</Link>
        </Button>
      </motion.div>
    </section>
  );
}
