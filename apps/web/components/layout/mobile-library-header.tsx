"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, Search, X, ArrowLeft } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Sidebar } from "./sidebar";
import { SortSelect } from "../library/sort-select";
import { type SortField, type SortOrder } from "../../lib/use-sort-preference";

interface MobileLibraryHeaderProps {
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  isAdmin: boolean;
}

export function MobileLibraryHeader({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  sortBy,
  sortOrder,
  onSortChange,
  isAdmin,
}: MobileLibraryHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus input when search expands
  useEffect(() => {
    if (searchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchExpanded]);

  // If there's a search value, show expanded search
  useEffect(() => {
    if (searchValue && !searchExpanded) {
      setSearchExpanded(true);
    }
  }, [searchValue, searchExpanded]);

  const handleClearSearch = () => {
    onSearchChange("");
    setSearchExpanded(false);
  };

  const handleCollapseSearch = () => {
    if (!searchValue) {
      setSearchExpanded(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 items-center border-b border-border/50 bg-background/80 px-4 backdrop-blur-sm lg:hidden">
        {searchExpanded ? (
          // Expanded search mode
          <div className="flex flex-1 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCollapseSearch}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9 pr-9"
              />
              {searchValue && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ) : (
          // Normal mode: hamburger + spacer + search icon + sort
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(true)}
              className="shrink-0"
            >
              <Menu className="h-6 w-6" />
            </Button>

            <div className="flex-1" />

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchExpanded(true)}
                className="shrink-0"
              >
                <Search className="h-5 w-5" />
              </Button>
              <SortSelect
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortChange={onSortChange}
              />
            </div>
          </>
        )}
      </header>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <div className="relative h-full">
              <Sidebar isAdmin={isAdmin} onNavigate={() => setMenuOpen(false)} />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
