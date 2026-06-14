"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { ComicCollectionListItem } from "../../lib/use-comic-collections";

export function ComicCollectionCard({ collection }: { collection: ComicCollectionListItem }) {
  const t = useTranslations("comics");
  return (
    <motion.article className="group relative flex flex-col" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <Link href={`/comics/collections/${collection.id}`} prefetch={false}>
        <motion.div
          className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-sm"
          whileHover={{ scale: 1.05, y: -4, boxShadow: "0 12px 24px rgba(0,0,0,0.15)" }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {collection.coverUrl ? (
            <Image
              src={collection.coverUrl}
              alt={collection.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              unoptimized={collection.coverUrl.startsWith("/api/")}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted">
              <span className="text-4xl text-muted-foreground" aria-hidden="true">🗂️</span>
            </div>
          )}
        </motion.div>
      </Link>
      <Link href={`/comics/collections/${collection.id}`} prefetch={false} className="mt-3 min-w-0">
        <div className="text-xs text-muted-foreground">{t("collections.seriesCount", { count: collection.seriesCount })}</div>
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">{collection.name}</h3>
      </Link>
    </motion.article>
  );
}
