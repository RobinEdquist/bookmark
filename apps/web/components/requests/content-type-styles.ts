import { Headphones, BookOpen, BookImage, type LucideIcon } from "lucide-react";
import type { ContentType } from "../../lib/use-requests";

export interface ContentTypeStyle {
  icon: LucideIcon;
  /** Accent bar / strip color */
  accentBar: string;
  /** Icon placeholder box colors */
  iconBox: string;
  /** Content-type badge colors */
  badge: string;
  /** Translation key under `requests.badge.*` */
  badgeKey: "audiobook" | "ebook" | "comics";
}

export const CONTENT_TYPE_STYLES: Record<ContentType, ContentTypeStyle> = {
  audiobook: {
    icon: Headphones,
    accentBar: "bg-primary",
    iconBox: "bg-primary/10 text-primary",
    badge: "bg-primary/15 text-primary",
    badgeKey: "audiobook",
  },
  ebook: {
    icon: BookOpen,
    accentBar: "bg-blue-500",
    iconBox: "bg-blue-500/10 text-blue-500",
    badge: "bg-blue-500/15 text-blue-500",
    badgeKey: "ebook",
  },
  comics: {
    icon: BookImage,
    accentBar: "bg-violet-500",
    iconBox: "bg-violet-500/10 text-violet-500",
    badge: "bg-violet-500/15 text-violet-500",
    badgeKey: "comics",
  },
};

/** Route to the library item a completed request was linked to. */
export function libraryItemHref(type: ContentType, id: string): string {
  switch (type) {
    case "audiobook":
      return `/audiobooks/${id}`;
    case "ebook":
      return `/ebooks/${id}`;
    case "comics":
      return `/comics/${id}`;
  }
}
