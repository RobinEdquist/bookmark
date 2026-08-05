import { cn } from "@repo/ui/lib/utils";

/**
 * Placeholder cover for items without cover art, styled after the marketing
 * site's fictional covers: a muted-rich gradient with the title and author
 * set like a printed jacket. Palette and art variant derive from a hash of
 * the seed (defaults to title), so the same book always gets the same cover
 * and re-renders are stable across sessions and devices.
 *
 * Sizing uses container-query units, so the same component works from a
 * 40px player thumbnail up to a detail-page hero. The parent decides aspect
 * ratio, border radius and clipping; this fills whatever box it's given.
 */

interface GeneratedCoverProps {
  title: string;
  author?: string | null;
  /** Comic issue designation, rendered oversized in the corner. */
  issue?: string | number | null;
  /**
   * Hash input for palette/variant. Pass the series title for comic issues
   * so every issue in a series shares one cover design.
   */
  seed?: string;
  className?: string;
  "aria-hidden"?: boolean;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const INK = "oklch(97% 0.01 90)";
const GRID_LINE = "oklch(100% 0 0 / 0.06)";

export function GeneratedCover({
  title,
  author,
  issue,
  seed,
  className,
  "aria-hidden": ariaHidden,
}: GeneratedCoverProps) {
  const hash = fnv1a(seed ?? title);

  const hue1 = hash % 360;
  const spread = 20 + ((hash >>> 9) % 40);
  const hue2 = (hue1 + ((hash >>> 7) & 1 ? spread : 360 - spread)) % 360;
  const c1 = `oklch(${42 + ((hash >>> 13) % 15)}% 0.0${6 + ((hash >>> 17) % 6)} ${hue1})`;
  const c2 = `oklch(${24 + ((hash >>> 21) % 9)}% 0.0${5 + ((hash >>> 25) % 5)} ${hue2})`;
  const variant = (hash >>> 27) & 3;

  const gradient = `linear-gradient(160deg, ${c1}, ${c2})`;
  const background =
    variant === 3
      ? `repeating-linear-gradient(0deg, ${GRID_LINE} 0 1px, transparent 1px 14cqw), repeating-linear-gradient(90deg, ${GRID_LINE} 0 1px, transparent 1px 14cqw), ${gradient}`
      : gradient;

  // Long real-world titles step down in size and gain clamp room so they
  // never collide with the author line.
  const titleSize =
    title.length <= 18 ? "12.5cqw" : title.length <= 34 ? "10.5cqw" : "8.75cqw";
  const titleClamp =
    title.length <= 18
      ? "line-clamp-4"
      : title.length <= 34
        ? "line-clamp-5"
        : "line-clamp-6";

  const issueText = issue != null && issue !== "" ? String(issue) : null;
  const issueSize =
    issueText === null
      ? undefined
      : issueText.length <= 2
        ? "42cqw"
        : issueText.length <= 4
          ? "28cqw"
          : "15cqw";

  return (
    <span
      role={ariaHidden ? undefined : "img"}
      aria-label={
        ariaHidden ? undefined : author ? `${title}, ${author}` : title
      }
      aria-hidden={ariaHidden}
      className={cn(
        "relative block h-full w-full select-none overflow-hidden",
        className,
      )}
      style={{
        background,
        color: INK,
        containerType: "inline-size",
        boxShadow: "inset 0 0 0 1px oklch(100% 0 0 / 0.07)",
      }}
    >
      {variant === 1 && (
        <span
          className="absolute inset-x-0 top-0 h-[44%]"
          style={{ background: "oklch(12% 0.02 300 / 0.32)" }}
        />
      )}
      {variant === 2 && (
        <span
          className="absolute rounded-full"
          style={{
            right: "-16%",
            bottom: "-16%",
            width: "62cqw",
            height: "62cqw",
            background: "oklch(100% 0 0 / 0.13)",
          }}
        />
      )}
      <span
        className={cn(
          "absolute inset-x-[9%] top-[9%] text-balance font-bold",
          titleClamp,
        )}
        style={{
          fontSize: titleSize,
          lineHeight: 1.08,
          letterSpacing: "-0.015em",
        }}
      >
        {title}
      </span>
      {variant === 0 && (
        <span className="absolute inset-x-[9%] bottom-[21%] h-px bg-current opacity-40" />
      )}
      {issueText && (
        <span
          className="absolute bottom-[2%] right-[6%] font-extrabold opacity-20"
          style={{
            fontSize: issueSize,
            lineHeight: 1,
            letterSpacing: "-0.05em",
          }}
        >
          {issueText}
        </span>
      )}
      {author && (
        <span
          className="absolute inset-x-[9%] bottom-[8%] truncate font-medium opacity-80"
          style={{ fontSize: "7.5cqw", letterSpacing: "0.02em" }}
        >
          {author}
        </span>
      )}
    </span>
  );
}
