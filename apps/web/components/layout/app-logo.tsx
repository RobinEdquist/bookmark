"use client";

import Link from "next/link";

const NEON_COLORS = [
  { color: "#ff00ff", glow: "#ff00ff" }, // Magenta
  { color: "#00ffff", glow: "#00ffff" }, // Cyan
  { color: "#ff3366", glow: "#ff3366" }, // Pink
  { color: "#39ff14", glow: "#39ff14" }, // Neon green
  { color: "#ff6600", glow: "#ff6600" }, // Orange
  { color: "#ffff00", glow: "#ffff00" }, // Yellow
  { color: "#bf00ff", glow: "#bf00ff" }, // Purple
  { color: "#00ff7f", glow: "#00ff7f" }, // Spring green
];

interface AppLogoProps {
  onClick?: () => void;
}

export function AppLogo({ onClick }: AppLogoProps) {
  const text = "bookmark";

  // Each letter gets its own neon colour, assigned by position. This used to
  // call Math.random() during render, which made the component impure in two
  // ways: the server and the client picked different colours, so the logo was a
  // guaranteed hydration mismatch, and useMemo is a cache React is free to
  // discard, so the colours could also change mid-session on a re-render.
  // Cycling the palette by index is stable everywhere and, because "bookmark"
  // is exactly as long as NEON_COLORS, still gives every letter a distinct hue.
  const letterColors = text
    .split("")
    .map((char, index) =>
      char === " " ? null : NEON_COLORS[index % NEON_COLORS.length],
    );

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Only call onClick for regular clicks, not ctrl/cmd+click (new tab)
    if (!e.ctrlKey && !e.metaKey) {
      onClick?.();
    }
  };

  return (
    <Link
      href="/home"
      onClick={handleClick}
      aria-label="bookmark - Go to home"
      className="block font-[family-name:var(--font-neonderthaw)] text-5xl leading-tight select-none transition-all duration-300 hover:brightness-125 hover:saturate-150 hover:drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
    >
      {text.split("").map((char, index) => {
        const colorInfo = letterColors[index];

        if (char === " ") {
          return <span key={index}>&nbsp;</span>;
        }

        return (
          <span
            key={index}
            className="inline-block"
            style={{
              color: colorInfo?.color,
              textShadow: colorInfo
                ? `0 0 5px ${colorInfo.glow}, 0 0 10px ${colorInfo.glow}, 0 0 20px ${colorInfo.glow}, 0 0 40px ${colorInfo.glow}`
                : undefined,
            }}
          >
            {char}
          </span>
        );
      })}
    </Link>
  );
}
