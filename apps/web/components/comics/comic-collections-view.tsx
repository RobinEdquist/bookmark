"use client";

import { useInfiniteComicCollections } from "../../lib/use-comic-collections";
import { ComicCollectionGrid } from "./comic-collection-grid";

interface ComicCollectionsViewProps {
  search: string;
}

export function ComicCollectionsView({ search }: ComicCollectionsViewProps) {
  const {
    data,
    isLoading,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteComicCollections({
    search: search || undefined,
  });

  // Flatten pages into a single array
  const collections = data?.pages.flatMap((page) => page.collections) ?? [];

  return (
    <ComicCollectionGrid
      collections={collections}
      isLoading={isLoading && !data}
      error={error}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => fetchNextPage()}
    />
  );
}
