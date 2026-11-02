"use client";

import DOMPurify from "dompurify";
import { cn } from "@repo/ui/lib/utils";

// ComicVine descriptions carry headings, lists, links and tables of variant
// covers; ComicInfo.xml summaries are usually plain text.
const DESCRIPTION_CLASSES =
  "text-sm leading-relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-foreground [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground [&_blockquote]:pl-4 [&_blockquote]:italic [&_em]:italic [&_h2]:mb-1 [&_h2]:mt-4 [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-4 [&_h3]:font-semibold [&_h4]:mb-1 [&_h4]:mt-4 [&_h4]:font-semibold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-2 [&_strong]:font-semibold [&_table]:my-2 [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:py-0.5 [&_td]:pr-4 [&_td]:align-top [&_th]:py-0.5 [&_th]:pr-4 [&_th]:text-left [&_th]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4";

interface ComicDescriptionProps {
  /** HTML or plain text; plain text renders as text. */
  html: string;
  className?: string;
  style?: React.CSSProperties;
  ref?: React.Ref<HTMLDivElement>;
}

/** A comic series description or issue summary, sanitized and rendered as HTML. */
export function ComicDescription({
  html,
  className,
  style,
  ref,
}: ComicDescriptionProps) {
  return (
    <div
      ref={ref}
      className={cn(DESCRIPTION_CLASSES, className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
    />
  );
}
