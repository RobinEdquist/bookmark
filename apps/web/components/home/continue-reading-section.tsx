"use client";

import { useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, MoreVertical, EyeOff, Settings, Clock } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  useAllEbookProgress,
  useHideEbookProgress,
  type EbookProgressWithEbook,
} from "../../lib/use-ebook-progress";
import { useEbook } from "../../lib/use-ebooks";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { useMyPermissions } from "../../lib/use-users";
import { HorizontalScrollRow } from "./horizontal-scroll-row";
import { READABLE_FORMATS } from "../ebooks/read-button";

function ContinueReadingCard({
  progress,
}: {
  progress: EbookProgressWithEbook;
}) {
  const t = useTranslations("home.continueReading");
  const router = useRouter();
  const { data: ebookDetail } = useEbook(progress.ebook.id);
  const { mutate: hideProgress, isPending: isHiding } = useHideEbookProgress();

  const isReadable = READABLE_FORMATS.has(progress.ebook.format.toLowerCase());

  const handleReadClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/ebooks/${progress.ebook.id}/read`);
  };

  const handleHide = () => {
    hideProgress(progress.ebook.id, {
      onSuccess: () => {
        toast.success(t("hideSuccess"));
      },
      onError: () => {
        toast.error(t("hideError"));
      },
    });
  };

  return (
    <div className="w-40 shrink-0 group/card">
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Cover with progress bar and read button */}
        <Link
          href={`/ebooks/${progress.ebook.id}`}
          prefetch={false}
          className="block"
        >
          <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border/50 bg-muted">
            <Image
              src={`/api/ebooks/${progress.ebook.id}/cover`}
              alt={progress.ebook.title}
              fill
              className="object-cover transition-transform duration-300 group-hover/card:scale-105"
              unoptimized
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
            {/* Fallback shown behind image or when image fails */}
            <div className="absolute inset-0 flex h-full items-center justify-center -z-10">
              <span className="text-4xl">📖</span>
            </div>

            {/* Read button overlay */}
            {isReadable && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/card:bg-black/30">
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-12 w-12 rounded-full opacity-0 shadow-lg transition-opacity group-hover/card:opacity-100"
                  onClick={handleReadClick}
                >
                  <BookOpen className="h-5 w-5" />
                </Button>
              </div>
            )}

            {/* Progress bar at bottom */}
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>
          </div>
        </Link>

        {/* Title and menu */}
        <div className="flex items-start gap-1">
          <Link
            href={`/ebooks/${progress.ebook.id}`}
            prefetch={false}
            className="min-w-0 flex-1"
          >
            <div className="space-y-0.5 px-0.5">
              <h3 className="truncate text-sm font-medium leading-tight">
                {progress.ebook.title}
              </h3>
              {ebookDetail?.authors[0]?.name && (
                <p className="truncate text-xs text-muted-foreground">
                  {ebookDetail.authors[0].name}
                </p>
              )}
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleHide} disabled={isHiding}>
                <EyeOff className="h-4 w-4" />
                {isHiding ? t("hiding") : t("hide")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>
    </div>
  );
}

export function ContinueReadingSection() {
  const t = useTranslations("home.continueReading");
  const { data: allProgress, isLoading } = useAllEbookProgress();
  const { data: availability, isLoading: isLoadingAvailability } =
    useLibraryAvailability();
  const { data: permissions, isLoading: isLoadingPermissions } =
    useMyPermissions();

  // Filter to only show incomplete ebooks, sorted by most recently updated
  const inProgressEbooks = useMemo(() => {
    if (!allProgress) return [];
    return allProgress
      .filter((p) => !p.completed && p.progressPercent > 0)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }, [allProgress]);

  if (isLoading || isLoadingAvailability || isLoadingPermissions) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="flex gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-40 shrink-0">
              <Skeleton className="aspect-[2/3] rounded-xl" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-1 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Check if ebook library is configured
  const ebookLibraryConfigured = availability?.ebooks ?? false;
  const isAdmin = permissions?.isAdmin ?? false;

  // Show different empty states based on library configuration and user role
  if (!ebookLibraryConfigured) {
    // No ebook library configured
    if (isAdmin) {
      // Admin: prompt to configure library
      return (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>

          <motion.div
            className="flex flex-col items-center justify-center rounded-xl border bg-card p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-4 rounded-full bg-primary/10 p-4">
              <Settings className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-medium">{t("noLibraryAdmin")}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t("noLibraryAdminDescription")}
            </p>
            <Button asChild className="mt-6">
              <Link href="/settings">{t("goToSettings")}</Link>
            </Button>
          </motion.div>
        </section>
      );
    } else {
      // Regular user: show waiting message
      return (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>

          <motion.div
            className="flex flex-col items-center justify-center rounded-xl border bg-card p-8 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-4 rounded-full bg-muted p-4">
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">{t("noLibraryUser")}</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {t("noLibraryUserDescription")}
            </p>
          </motion.div>
        </section>
      );
    }
  }

  // Hide section when library is configured but no in-progress ebooks
  if (inProgressEbooks.length === 0) {
    return null;
  }

  return (
    <HorizontalScrollRow title={t("title")}>
      {inProgressEbooks.map((progress) => (
        <ContinueReadingCard key={progress.ebookId} progress={progress} />
      ))}
    </HorizontalScrollRow>
  );
}
