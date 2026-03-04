"use client";

import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@repo/ui/components/ui/input";
import { MobileLibraryHeader } from "../layout/mobile-library-header";

interface LibraryPageHeaderProps {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  isSearching?: boolean;
  sortControl: React.ReactNode;
  isAdmin?: boolean;
}

export function LibraryPageHeader({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  isSearching = false,
  sortControl,
  isAdmin = false,
}: LibraryPageHeaderProps) {
  return (
    <>
      {/* Mobile header */}
      <MobileLibraryHeader
        searchPlaceholder={searchPlaceholder}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        sortControl={sortControl}
        isAdmin={isAdmin}
      />

      {/* Desktop header */}
      <header className="sticky top-0 z-10 hidden border-b border-border/50 bg-background/80 px-8 py-4 backdrop-blur-sm lg:block">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <div className="relative w-64">
            {isSearching ? (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <Input
              type="text"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchValue && (
              <button
                type="button"
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {sortControl}
        </div>
      </header>
    </>
  );
}
