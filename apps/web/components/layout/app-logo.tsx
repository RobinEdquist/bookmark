"use client";

import { useMemo } from "react";
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
  const text = "bookmarks";

  // Generate random colors for each letter, memoized to prevent re-renders
  const letterColors = useMemo(() => {
    return text.split("").map((char) => {
      if (char === " ") return null;
      return NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)];
    });
  }, []);

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
      aria-label="bookmarks - Go to home"
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
