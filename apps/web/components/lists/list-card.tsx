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
          <div className="relative aspect-square w-full">
            {covers.length > 0 ? (
              <div className="relative h-full w-full">
                {covers.map((coverUrl, index) => {
                  // Fan effect: covers spread horizontally with slight overlap
                  // First cover on left, last on right, front cover on top
                  const totalCovers = covers.length;
                  const isTopCover = index === 0;

                  // Calculate horizontal position (spread across container)
                  const spreadAmount = totalCovers > 1 ? 20 : 0; // percentage spread per cover
                  const leftOffset = index * spreadAmount;

                  // Slight rotation for visual interest (back covers tilted)
                  const rotation = index === 0 ? 0 : (index === 1 ? -6 : -12);

                  // Z-index: first cover on top
                  const zIndex = totalCovers - index;

                  return (
                    <motion.div
                      key={coverUrl + index}
                      className="absolute overflow-hidden rounded-lg border border-black/10 shadow-lg dark:border-white/10"
                      style={{
                        width: "75%",
                        height: "75%",
                        left: `${leftOffset}%`,
                        top: "12%",
                        zIndex,
                        transform: `rotate(${rotation}deg)`,
                        transformOrigin: "bottom center",
                      }}
                      variants={{
                        hover: {
                          scale: isTopCover ? 1.02 : 1,
                          boxShadow: "0 12px 32px rgba(0,0,0,0.2)",
                        },
                      }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
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
              <div className="absolute inset-0 flex items-center justify-center rounded-xl border bg-muted">
                <ListMusic className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>

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
