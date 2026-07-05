"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { BOOKS, Cover } from "./covers";

/**
 * A live miniature of the real theming system: 16 accents × 13 surfaces
 * in the product; a taste of each axis here.
 */
const ACCENTS = [
  { name: "White", value: "hsl(0 0% 100%)", fg: "hsl(0 0% 8%)" },
  { name: "Orange", value: "hsl(25 95% 53%)", fg: "hsl(20 14% 6%)" },
  { name: "Coral", value: "hsl(16 85% 60%)", fg: "hsl(20 14% 6%)" },
  { name: "Red", value: "hsl(0 72% 51%)", fg: "hsl(0 0% 100%)" },
  { name: "Blue", value: "hsl(217 91% 60%)", fg: "hsl(220 20% 8%)" },
  { name: "Cyan", value: "hsl(189 94% 53%)", fg: "hsl(200 20% 8%)" },
  { name: "Green", value: "hsl(142 71% 45%)", fg: "hsl(150 20% 6%)" },
  { name: "Violet", value: "hsl(262 83% 66%)", fg: "hsl(260 20% 8%)" },
];

const SURFACES = [
  {
    name: "Pitch",
    vars: {
      "--td-bg": "hsl(0 0% 0%)",
      "--td-card": "hsl(0 0% 5%)",
      "--td-line": "hsl(0 0% 16%)",
      "--td-ink": "hsl(0 0% 94%)",
      "--td-muted": "hsl(0 0% 58%)",
    },
  },
  {
    name: "Espresso",
    vars: {
      "--td-bg": "hsl(24 14% 6%)",
      "--td-card": "hsl(24 12% 10%)",
      "--td-line": "hsl(24 10% 18%)",
      "--td-ink": "hsl(30 20% 93%)",
      "--td-muted": "hsl(28 10% 60%)",
    },
  },
  {
    name: "Silver",
    vars: {
      "--td-bg": "hsl(220 12% 91%)",
      "--td-card": "hsl(0 0% 99%)",
      "--td-line": "hsl(220 10% 82%)",
      "--td-ink": "hsl(222 14% 12%)",
      "--td-muted": "hsl(220 8% 42%)",
    },
  },
];

export function ThemeDemo() {
  const [accent, setAccent] = useState(1); // Orange
  const [surface, setSurface] = useState(0); // Pitch
  const book = BOOKS[7]!;

  const a = ACCENTS[accent]!;
  const s = SURFACES[surface]!;

  return (
    <div className="theme-demo">
      <div
        className="theme-demo-stage"
        style={{ "--td-accent": a.value, "--td-accent-fg": a.fg, ...s.vars } as CSSProperties}
      >
        <div className="td-app" aria-hidden>
          <div className="dm-h2">Continue listening</div>
          <div className="td-row">
            <Cover book={book} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="dm-book-title" style={{ color: "inherit" }}>
                {book.title}
              </div>
              <div className="dm-book-meta">{book.author} · 4h 12m left</div>
              <div className="td-bar">
                <span className="td-fill" />
              </div>
            </div>
          </div>
          <div className="td-buttons">
            <span className="td-btn">Resume</span>
            <span className="td-btn td-btn-ghost">Chapters</span>
          </div>
        </div>
      </div>

      <div className="theme-demo-controls">
        <div className="swatch-row" role="group" aria-label="Accent color">
          {ACCENTS.map((item, i) => (
            <button
              key={item.name}
              type="button"
              className="swatch"
              style={{ background: item.value, color: item.value }}
              aria-pressed={i === accent}
              aria-label={`${item.name} accent`}
              onClick={() => setAccent(i)}
            />
          ))}
        </div>
        <div className="surface-row" role="group" aria-label="Surface theme">
          {SURFACES.map((item, i) => (
            <button
              key={item.name}
              type="button"
              className="surface-chip"
              aria-pressed={i === surface}
              onClick={() => setSurface(i)}
            >
              {item.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
