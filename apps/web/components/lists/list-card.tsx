"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MoreVertical, Lock, Globe, Pencil, Trash2, ListMusic } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@repo/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import type { List } from "../../lib/use-lists";

interface ListCardProps {
  list: List;
  onEdit?: (list: List) => void;
  onDelete?: (list: List) => void;
}

export function ListCard({ list, onEdit, onDelete }: ListCardProps) {
  const t = useTranslations("lists");

  // Get up to 3 covers for stacking
  const covers = list.previewCovers?.slice(0, 3) ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        href={`/lists/${list.id}`}
        className="group block"
      >
        <motion.article
          className="cursor-pointer"
          whileHover="hover"
        >
          {/* Stacked covers - fan layout */}
          <motion.div
            className="relative aspect-square w-full"
            initial="idle"
            whileHover="hover"
          >
            {covers.length > 0 ? (
              <div className="relative h-full w-full">
                {/* Render in reverse so first cover renders last (on top) */}
                {[...covers].reverse().map((coverUrl, reverseIndex) => {
                  const index = covers.length - 1 - reverseIndex;
                  const totalCovers = covers.length;

                  // Balanced fan configs for 1, 2, or 3 covers
                  // Front cover (index 0) is always on top and centered
                  const configs: Record<number, { idle: { rotations: number[]; xOffsets: number[] }; hover: { rotations: number[]; xOffsets: number[] } }> = {
                    1: {
                      idle: { rotations: [0], xOffsets: [0] },
                      hover: { rotations: [0], xOffsets: [0] },
                    },
                    2: {
                      // Front centered, back fans right
                      idle: { rotations: [0, 8], xOffsets: [0, 18] },
                      hover: { rotations: [-4, 12], xOffsets: [-8, 24] },
                    },
                    3: {
                      // Front centered, others fan left and right symmetrically
                      idle: { rotations: [0, -8, 8], xOffsets: [0, -14, 14] },
                      hover: { rotations: [0, -14, 14], xOffsets: [0, -22, 22] },
                    },
                  };

                  const config = configs[totalCovers] ?? configs[1];

                  return (
                    <motion.div
                      key={coverUrl + index}
                      className="absolute overflow-hidden rounded-lg border border-black/10 shadow-lg dark:border-white/10"
                      style={{
                        width: "70%",
                        height: "70%",
                        left: "15%",
                        top: "15%",
                        zIndex: totalCovers - index,
                        transformOrigin: "bottom center",
                      }}
                      variants={{
                        idle: {
                          x: `${config?.idle.xOffsets[index] ?? 0}%`,
                          rotate: config?.idle.rotations[index] ?? 0,
                          scale: 1,
                        },
                        hover: {
                          x: `${config?.hover.xOffsets[index] ?? 0}%`,
                          rotate: config?.hover.rotations[index] ?? 0,
                          scale: index === 0 ? 1.02 : 1,
                        },
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <Image
                        src={coverUrl}
                        alt={list.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 200px"
                        unoptimized={coverUrl.startsWith("/api/")}
                      />
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ListMusic className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </motion.div>

          {/* Text content */}
          <div className="mt-3 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary">
                {list.name}
              </h3>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {list.isPublic ? (
                  <Globe className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                <span>
                  {list.itemCount} {list.itemCount === 1 ? t("item") : t("items")}
                </span>
                {list.ownerName && (
                  <>
                    <span>•</span>
                    <span className="truncate">{list.ownerName}</span>
                  </>
                )}
              </div>
            </div>

            {(onEdit || onDelete) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onEdit && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        onEdit(list);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                      {t("edit")}
                    </DropdownMenuItem>
                  )}
                  {onDelete && (
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.preventDefault();
                        onDelete(list);
                      }}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("delete")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </motion.article>
      </Link>
    </motion.div>
  );
}
