"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Headphones, BookOpen, Calendar, Tag, FileText, Globe, HardDrive, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import DOMPurify from "dompurify";
import { Button } from "@repo/ui/components/ui/button";
import { Badge } from "@repo/ui/components/ui/badge";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import type { MamSearchResult } from "../../lib/use-requests";

interface RequestDetailPanelProps {
  item: MamSearchResult | null;
  isOpen: boolean;
  onClose: () => void;
  onRequest: (item: MamSearchResult) => void;
  onSupport: (requestId: string) => void;
  isRequesting: boolean;
  isSupporting: boolean;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
}

function sanitizeHtml(html: string): string {
  // Using DOMPurify to sanitize HTML content for safe rendering
  return DOMPurify.sanitize(html);
}

export function RequestDetailPanel({
  item,
  isOpen,
  onClose,
  onRequest,
  onSupport,
  isRequesting,
  isSupporting,
}: RequestDetailPanelProps) {
  const t = useTranslations("requests");

  // Handle escape key to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const sanitizedDescription = item?.description ? sanitizeHtml(item.description) : null;

  return (
    <>
      {/* Clickable backdrop (transparent) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="detail-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && item && (
          <motion.div
            key="detail-panel-content"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-background shadow-lg sm:max-w-xl"
          >
            {/* Header */}
            <div className="space-y-4 border-b p-6">
              {/* Content Type Badge */}
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  {item.contentType === "audiobook" ? (
                    <Headphones className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex gap-2">
                  <Badge variant={item.contentType === "audiobook" ? "default" : "secondary"}>
                    {item.contentType === "audiobook" ? t("badge.audiobook") : t("badge.ebook")}
                  </Badge>
                  <Badge variant="outline">{item.category}</Badge>
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold">{item.title}</h2>
                {item.author && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t("card.by", { author: item.author })}
                  </p>
                )}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {/* Narrator */}
              {item.narrator && (
                <div>
                  <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                    {t("detail.narrator")}
                  </h4>
                  <p className="text-sm">{item.narrator}</p>
                </div>
              )}

              {/* Series */}
              {item.series && item.series.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                    {t("detail.series")}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {item.series.map((s, idx) => (
                      <Badge key={idx} variant="secondary">
                        {s.number ? `${s.name} #${s.number}` : s.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span>{item.size}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span>{item.language}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>{item.fileType}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDate(item.addedDate)}</span>
                </div>
              </div>

              {/* Tags */}
              {item.tags && item.tags.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Tag className="h-4 w-4" />
                    {t("detail.tags")}
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Description - sanitized with DOMPurify */}
              {sanitizedDescription && (
                <div>
                  <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                    {t("detail.description")}
                  </h4>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-sm [&_img]:max-w-full [&_img]:rounded-md"
                    dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
                  />
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="border-t p-6">
              {item.inLibrary ? (
                <Button variant="outline" disabled className="w-full">
                  {t("button.inLibrary")}
                </Button>
              ) : item.existingRequestId ? (
                item.existingRequestStatus === "pending" ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => onSupport(item.existingRequestId!)}
                    disabled={isSupporting}
                  >
                    {isSupporting ? <LoadingSpinner size="sm" /> : t("button.support")}
                  </Button>
                ) : (
                  <Button variant="outline" disabled className="w-full">
                    {t(`status.${item.existingRequestStatus}`)}
                  </Button>
                )
              ) : (
                <Button className="w-full" onClick={() => onRequest(item)} disabled={isRequesting}>
                  {isRequesting ? <LoadingSpinner size="sm" /> : t("button.request")}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close button - positioned outside panel like mobile sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="detail-panel-close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
            className="fixed top-4 z-50 left-4 sm:left-auto sm:right-[37rem]"
          >
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full shadow-md"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
