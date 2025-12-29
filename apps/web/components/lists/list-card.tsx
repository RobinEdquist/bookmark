"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { MoreVertical, Lock, Globe, Pencil, Trash2 } from "lucide-react";
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Link
        href={`/lists/${list.id}`}
        className="group block rounded-lg border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium text-foreground group-hover:text-primary">
              {list.name}
            </h3>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              {list.isPublic ? (
                <Globe className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              <span>
                {list.itemCount} {list.itemCount === 1 ? t("item") : t("items")}
              </span>
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
      </Link>
    </motion.div>
  );
}
