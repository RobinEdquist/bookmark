import { Suspense } from "react";
import { GenresPageContent } from "../../../components/genres/genres-page-content";
import { Skeleton } from "@repo/ui/components/ui/skeleton";

export const metadata = {
  title: "Genres",
};

function GenresPageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function GenresPage() {
  return (
    <Suspense fallback={<GenresPageSkeleton />}>
      <GenresPageContent />
    </Suspense>
  );
}
