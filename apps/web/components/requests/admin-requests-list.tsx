"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown, Trash2 } from "lucide-react";
import { CONTENT_TYPE_STYLES } from "./content-type-styles";
import { Button } from "@repo/ui/components/ui/button";
import { Card, CardContent } from "@repo/ui/components/ui/card";
import { Badge } from "@repo/ui/components/ui/badge";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Textarea } from "@repo/ui/components/ui/textarea";
import type { RequestResponse } from "../../lib/use-requests";

interface AdminRequestsListProps {
  requests: RequestResponse[];
  isLoading: boolean;
  onApprove: (id: string) => Promise<unknown>;
  onReject: (id: string, reason?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  isApproving: boolean;
  isRejecting: boolean;
  isDeleting: boolean;
}

const statusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  approved: "default",
  downloading: "default",
  complete: "default",
  rejected: "destructive",
};

export function AdminRequestsList({
  requests,
  isLoading,
  onApprove,
  onReject,
  onDelete,
  isApproving,
  isRejecting,
  isDeleting,
}: AdminRequestsListProps) {
  const t = useTranslations("admin.requests");
  const tRequests = useTranslations("requests");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [requestToDelete, setRequestToDelete] =
    useState<RequestResponse | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  const handleRejectClick = (id: string) => {
    setSelectedRequestId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (selectedRequestId) {
      await onReject(selectedRequestId, rejectReason || undefined);
      setRejectDialogOpen(false);
      setSelectedRequestId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (requestToDelete) {
      await onDelete(requestToDelete.id);
      setRequestToDelete(null);
    }
  };

  const formatDateTime = (dateString: string) =>
    new Date(dateString).toLocaleString();

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return t("timeAgo.days", { count: diffDays });
    if (diffHours > 0) return t("timeAgo.hours", { count: diffHours });
    return t("timeAgo.justNow");
  };

  return (
    <>
      <div className="space-y-4">
        {requests.map((request) => {
          const TypeIcon = CONTENT_TYPE_STYLES[request.contentType].icon;
          return (
            <Card key={request.id}>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {/* Content Type Icon */}
                  <div className="flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-lg bg-muted shrink-0">
                    <TypeIcon className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground" />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-start gap-2">
                      <h3 className="font-semibold flex-1 min-w-0">
                        <span className="line-clamp-2 sm:line-clamp-1">
                          {request.title}
                          {request.author && ` - ${request.author}`}
                        </span>
                      </h3>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {request.torrentMissingSince && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {t("torrentMissing.badge")}
                          </Badge>
                        )}
                        <Badge variant={statusVariants[request.status]}>
                          {request.status === "approved" &&
                          request.autoApprovedByUserId
                            ? request.autoApprovedByUserId === request.userId
                              ? tRequests("autoApprove.autoApproved")
                              : tRequests("autoApprove.autoApprovedBy", {
                                  email:
                                    request.autoApprovedByEmail ?? "Unknown",
                                })
                            : t(`status.${request.status}`)}
                        </Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {t("requestedBy", { email: request.userEmail })}
                      {request.supporterCount > 0 && (
                        <span className="ml-1">
                          {t("supporters", { count: request.supporterCount })}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimeAgo(request.createdAt)}
                    </p>

                    {request.torrentMissingSince && (
                      <p className="text-sm text-destructive">
                        {t("torrentMissing.description", {
                          date: formatDateTime(request.torrentMissingSince),
                        })}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions - separate row on mobile */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                  {request.status === "pending" && (
                    <>
                      <Button
                        onClick={() => onApprove(request.id)}
                        disabled={isApproving}
                        size="sm"
                        className="flex-1 sm:flex-none"
                      >
                        {isApproving ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          t("approve")
                        )}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isRejecting}
                            className="flex-1 sm:flex-none"
                          >
                            {t("reject")}
                            <ChevronDown className="ml-1 h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => onReject(request.id)}
                          >
                            {t("rejectWithoutReason")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRejectClick(request.id)}
                          >
                            {t("rejectWithReason")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRequestToDelete(request)}
                    disabled={isDeleting}
                    aria-label={t("delete")}
                    className="ml-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    {/* Label folds away on mobile so it fits next to approve/reject */}
                    <span className="hidden sm:inline">{t("delete")}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Reject with reason dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("rejectDialog.description")}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={t("rejectDialog.placeholder")}
            value={rejectReason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setRejectReason(e.target.value)
            }
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectDialogOpen(false)}
            >
              {t("rejectDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={isRejecting}
            >
              {isRejecting ? (
                <LoadingSpinner size="sm" />
              ) : (
                t("rejectDialog.confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={requestToDelete !== null}
        onOpenChange={(open: boolean) => !open && setRequestToDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
            <DialogDescription>
              {t("deleteDialog.description", {
                title: requestToDelete?.title ?? "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestToDelete(null)}>
              {t("deleteDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <LoadingSpinner size="sm" />
              ) : (
                t("deleteDialog.confirm")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
