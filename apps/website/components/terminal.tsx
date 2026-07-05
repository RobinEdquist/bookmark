"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/** A terminal window; the copy button grabs only the commands. */
export function Terminal({
  title,
  copyText,
  children,
}: {
  title: string;
  copyText?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (e.g. non-secure context): nothing to do.
    }
  }

  return (
    <div className="terminal">
      <div className="terminal-bar">
        <span className="terminal-dot" aria-hidden />
        <span className="terminal-dot" aria-hidden />
        <span className="terminal-dot" aria-hidden />
        <span className="terminal-title">{title}</span>
        {copyText && (
          <button type="button" className="terminal-copy" onClick={copy}>
            {copied ? "copied" : "copy"}
          </button>
        )}
      </div>
      <pre>{children}</pre>
    </div>
  );
}
