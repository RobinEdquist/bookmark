"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@repo/ui/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@repo/ui/components/ui/popover";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useAudiobooks, type AudiobookListItem } from "../../lib/use-audiobooks";
import { useEbooks, type EbookListItem } from "../../lib/use-ebooks";

interface HeaderSearchProps {
  mediaType: "audiobook" | "ebook";
}

export function HeaderSearch({ mediaType }: HeaderSearchProps) {
  const t = useTranslations("common.headerSearch");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  const audiobooksQuery = useAudiobooks(
    mediaType === "audiobook" && debouncedSearch.length >= 2
      ? { search: debouncedSearch, limit: 6 }
      : { limit: 0 }
  );

  const ebooksQuery = useEbooks(
    mediaType === "ebook" && debouncedSearch.length >= 2
      ? { search: debouncedSearch, limit: 6 }
      : { limit: 0 }
  );

  const isLoading =
    mediaType === "audiobook"
      ? audiobooksQuery.isFetching
      : ebooksQuery.isFetching;

  const results =
    mediaType === "audiobook"
      ? audiobooksQuery.data?.audiobooks ?? []
      : ebooksQuery.data?.ebooks ?? [];

  const handleSelect = (id: string) => {
    setOpen(false);
    setSearchQuery("");
    router.push(`/${mediaType}s/${id}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setOpen(value.length >= 2);
  };

  const handleInputFocus = () => {
    if (searchQuery.length >= 2) {
      setOpen(true);
    }
  };

  const handleInputBlur = () => {
    // Delay close to allow clicking on results
    setTimeout(() => setOpen(false), 200);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative hidden w-48 sm:block lg:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            placeholder={t("placeholder")}
            value={searchQuery}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            className="pl-9 pr-9"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {results.length > 0 ? (
          <ul className="max-h-80 overflow-y-auto py-1">
            {results.map((item) => (
              <SearchResultItem
                key={item.id}
                item={item}
                onSelect={handleSelect}
              />
            ))}
          </ul>
        ) : debouncedSearch.length >= 2 && !isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t("noResults")}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

interface SearchResultItemProps {
  item: AudiobookListItem | EbookListItem;
  onSelect: (id: string) => void;
}

function SearchResultItem({ item, onSelect }: SearchResultItemProps) {
  const authors = item.authors.map((a) => a.name).join(", ");

  return (
    <li>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
        onClick={() => onSelect(item.id)}
      >
        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded">
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt=""
              fill
              className="object-cover"
              sizes="40px"
              unoptimized={item.coverUrl.startsWith("/api/")}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.title}</p>
          {authors && (
            <p className="truncate text-xs text-muted-foreground">{authors}</p>
          )}
        </div>
      </button>
    </li>
  );
}
