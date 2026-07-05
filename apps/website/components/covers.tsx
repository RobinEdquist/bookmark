import type { CSSProperties } from "react";

/**
 * Fictional books only — no real titles or cover art appear in the
 * marketing material. Colors stay muted-rich so they read as printed
 * covers against the dark UI, not as neon.
 */
export interface FakeBook {
  title: string;
  author: string;
  variant: 1 | 2 | 3 | 4;
  c1: string;
  c2: string;
}

export const BOOKS: FakeBook[] = [
  { title: "The Glass Meridian", author: "Ada Voss", variant: 1, c1: "oklch(46% 0.09 230)", c2: "oklch(28% 0.1 285)" },
  { title: "Salt & Starlight", author: "M. K. Aldous", variant: 3, c1: "oklch(35% 0.09 290)", c2: "oklch(22% 0.06 260)" },
  { title: "The Last Lighthouse", author: "June Okafor", variant: 2, c1: "oklch(52% 0.07 195)", c2: "oklch(32% 0.06 240)" },
  { title: "Paper Planets", author: "H. Lindqvist", variant: 4, c1: "oklch(55% 0.13 55)", c2: "oklch(32% 0.11 25)" },
  { title: "A Theory of Rain", author: "Imre Tóth", variant: 1, c1: "oklch(44% 0.06 250)", c2: "oklch(27% 0.05 210)" },
  { title: "The Midnight Cartographer", author: "R. Ellery", variant: 3, c1: "oklch(38% 0.1 330)", c2: "oklch(24% 0.08 20)" },
  { title: "Small Gods of the City", author: "Priya Anand", variant: 2, c1: "oklch(46% 0.08 150)", c2: "oklch(30% 0.07 120)" },
  { title: "Winter Harbour", author: "E. Sandell", variant: 4, c1: "oklch(60% 0.05 220)", c2: "oklch(30% 0.07 255)" },
  { title: "The Orchard at Night", author: "C. Weaver", variant: 1, c1: "oklch(40% 0.08 140)", c2: "oklch(24% 0.05 170)" },
  { title: "Letters to a Comet", author: "Y. Nakamura", variant: 3, c1: "oklch(33% 0.04 270)", c2: "oklch(45% 0.11 250)" },
];

export interface FakeComic extends FakeBook {
  issue: number;
}

export const COMICS: FakeComic[] = [
  { title: "Neon Harbor", author: "Vega & Ruiz", variant: 2, issue: 12, c1: "oklch(50% 0.14 350)", c2: "oklch(28% 0.1 300)" },
  { title: "Static Age", author: "T. Brand", variant: 1, issue: 3, c1: "oklch(58% 0.12 90)", c2: "oklch(35% 0.1 60)" },
  { title: "Moth & Flame", author: "K. Ilves", variant: 3, issue: 7, c1: "oklch(45% 0.12 25)", c2: "oklch(25% 0.08 340)" },
];

export function Cover({
  book,
  tall = false,
  issue,
  className,
}: {
  book: FakeBook;
  tall?: boolean;
  issue?: number;
  className?: string;
}) {
  return (
    <span
      className={`cover cover-v${book.variant} ${tall ? "cover-tall" : ""} ${className ?? ""}`}
      style={{ "--c1": book.c1, "--c2": book.c2 } as CSSProperties}
      role="img"
      aria-label={`Fictional cover: ${book.title} by ${book.author}`}
    >
      <span className="cover-title">{book.title}</span>
      <span className="cover-author">{book.author}</span>
      {issue !== undefined && <span className="cover-issue">{issue}</span>}
    </span>
  );
}
