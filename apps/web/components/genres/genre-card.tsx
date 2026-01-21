"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { cn } from "@repo/ui/lib/utils";

import type { GenreWithCount, ContentType } from "../../lib/use-genres";

// Gradient pairs for genre cards
const GRADIENTS = [
  ["#8B5CF6", "#EC4899"], // Purple → Pink
  ["#3B82F6", "#06B6D4"], // Blue → Cyan
  ["#F97316", "#EAB308"], // Orange → Yellow
  ["#22C55E", "#14B8A6"], // Green → Teal
  ["#EF4444", "#F97316"], // Red → Orange
  ["#6366F1", "#8B5CF6"], // Indigo → Purple
  ["#EC4899", "#F43F5E"], // Pink → Rose
  ["#06B6D4", "#3B82F6"], // Cyan → Blue
  ["#F59E0B", "#F97316"], // Amber → Orange
  ["#10B981", "#22C55E"], // Emerald → Green
];

function getGradientForGenre(name: string): [string, string] {
  // Generate consistent index from genre name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index] as [string, string];
}

interface GenreCardProps {
  genre: GenreWithCount;
  contentType: ContentType;
  onClick: () => void;
  index?: number;
}

export function GenreCard({ genre, contentType, onClick, index = 0 }: GenreCardProps) {
  const t = useTranslations("common.genres");
  const [from, to] = getGradientForGenre(genre.name);
  const typeLabel = contentType === "audiobooks" ? "audiobooks" : "ebooks";

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "relative aspect-square w-full overflow-hidden rounded-xl",
        "shadow-md transition-shadow hover:shadow-xl",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      )}
      style={{
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
      }}
    >
      {/* Genre name */}
      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
        <span
          className="text-center text-lg font-bold text-white sm:text-xl"
          style={{ textShadow: "0 2px 4px rgba(0,0,0,0.3)" }}
        >
          {genre.name}
        </span>
      </div>

      {/* Count badge */}
      <div className="absolute bottom-2 right-2 rounded-full bg-black/30 px-2 py-0.5 backdrop-blur-sm">
        <span className="text-xs font-medium text-white">
          {t("itemCount", { count: genre.count, type: typeLabel })}
        </span>
      </div>
    </motion.button>
  );
}
