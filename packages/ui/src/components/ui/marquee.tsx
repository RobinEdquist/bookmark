"use client";

import * as React from "react";
import { useRef, useState, useEffect, useCallback, useId } from "react";
import { cn } from "../../lib/utils";

interface MarqueeProps {
  children: React.ReactNode;
  className?: string;
  /** Speed in pixels per second */
  speed?: number;
  /** Pause duration at start/end in milliseconds */
  pauseDuration?: number;
  /** Gap between repeated content when scrolling */
  gap?: number;
}

export function Marquee({
  children,
  className,
  speed = 30,
  pauseDuration = 2000,
  gap = 40,
}: MarqueeProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const [contentWidth, setContentWidth] = useState(0);

  // Check if content overflows container
  const checkOverflow = useCallback(() => {
    if (containerRef.current && contentRef.current) {
      const container = containerRef.current.offsetWidth;
      const content = contentRef.current.scrollWidth;
      setContentWidth(content);
      setShouldAnimate(content > container);
    }
  }, []);

  // Check overflow on mount and when children change
  useEffect(() => {
    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [children, checkOverflow]);

  // Calculate animation duration based on content width and speed
  const scrollDistance = contentWidth + gap;
  const scrollDuration = scrollDistance / speed;
  const pauseSec = pauseDuration / 1000;
  const totalDuration = scrollDuration + pauseSec * 2;

  // Calculate keyframe percentages for: pause -> scroll -> pause
  const startPauseEnd = (pauseSec / totalDuration) * 100;
  const scrollEnd = ((pauseSec + scrollDuration) / totalDuration) * 100;

  // Sanitize ID for CSS (remove colons from React's useId)
  const cssId = id.replace(/:/g, "-");

  if (!shouldAnimate) {
    return (
      <div ref={containerRef} className={cn("overflow-hidden", className)}>
        <div ref={contentRef} className="whitespace-nowrap truncate">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("overflow-hidden", className)}>
      <style>
        {`
          @keyframes marquee-${cssId} {
            0%, ${startPauseEnd.toFixed(1)}% {
              transform: translateX(0);
            }
            ${scrollEnd.toFixed(1)}%, 100% {
              transform: translateX(-${contentWidth + gap}px);
            }
          }
        `}
      </style>
      <div
        className="inline-flex whitespace-nowrap"
        style={{
          animation: `marquee-${cssId} ${totalDuration}s linear infinite`,
        }}
      >
        <div ref={contentRef} className="shrink-0">
          {children}
        </div>
        <div className="shrink-0" style={{ width: gap }} />
        <div className="shrink-0" aria-hidden>
          {children}
        </div>
      </div>
    </div>
  );
}
