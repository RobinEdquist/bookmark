"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";

interface HorizontalScrollRowProps {
  title: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  children: React.ReactNode;
}

export function HorizontalScrollRow({
  title,
  seeAllHref,
  seeAllLabel,
  children,
}: HorizontalScrollRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const checkScrollability = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  }, []);

  useEffect(() => {
    checkScrollability();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScrollability);
      window.addEventListener("resize", checkScrollability);
      return () => {
        container.removeEventListener("scroll", checkScrollability);
        window.removeEventListener("resize", checkScrollability);
      };
    }
  }, [checkScrollability]);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollAmount = container.clientWidth * 0.8;
      container.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {seeAllHref && seeAllLabel && (
          <Link
            href={seeAllHref}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {seeAllLabel} →
          </Link>
        )}
      </div>

      <div
        className="group relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        {/* Left arrow */}
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "absolute -left-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full shadow-lg transition-opacity",
            isHovering && canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        {/* Scroll container */}
        <div
          ref={scrollContainerRef}
          className="-mx-2 flex gap-4 overflow-x-auto px-2 py-2 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {children}
        </div>

        {/* Right arrow */}
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "absolute -right-4 top-1/2 z-10 h-10 w-10 -translate-y-1/2 rounded-full shadow-lg transition-opacity",
            isHovering && canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
          onClick={() => scroll("right")}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </section>
  );
}
