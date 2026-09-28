"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { EbookGroupListItem } from "../../lib/use-ebook-groups";
import { GeneratedCover } from "../common/generated-cover";

export function EbookGroupCard({
  group,
  animateEntrance = true,
}: {
  group: EbookGroupListItem;
  animateEntrance?: boolean;
}) {
  const t = useTranslations("ebooks");

  return (
    <motion.article
      className="group relative flex flex-col"
      initial={animateEntrance ? { opacity: 0, y: 20 } : false}
      animate={{ opacity: 1, y: 0 }}
    >
      <Link href={`/ebooks/groups/${group.id}`} prefetch={false}>
        <motion.div
          className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-sm"
          whileHover={{
            scale: 1.05,
            y: -4,
            boxShadow: "0 12px 24px rgba(0,0,0,0.15)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {group.coverUrl ? (
            <Image
              src={group.coverUrl}
              alt={group.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              unoptimized={group.coverUrl.startsWith("/api/")}
            />
          ) : (
            <GeneratedCover title={group.name} />
          )}
        </motion.div>
      </Link>
      <Link
        href={`/ebooks/groups/${group.id}`}
        prefetch={false}
        className="mt-3 min-w-0"
      >
        <div className="text-xs text-muted-foreground">
          {t("groups.ebookCount", { count: group.ebookCount })}
        </div>
        <h3 className="line-clamp-2 text-sm font-medium leading-tight">
          {group.name}
        </h3>
      </Link>
    </motion.article>
  );
}
