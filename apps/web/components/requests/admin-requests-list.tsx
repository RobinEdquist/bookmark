"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Headphones, BookOpen, ChevronDown } from "lucide-react";
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
  isApproving: boolean;
  isRejecting: boolean;
}

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
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
  isApproving,
  isRejecting,
}: AdminRequestsListProps) {
  const t = useTranslations("admin.requests");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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
        {requests.map((request) => (
          <Card key={request.id}>
            <CardContent className="flex gap-4 p-4">
              {/* Content Type Icon */}
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted">
                {request.contentType === "audiobook" ? (
                  <Headphones className="h-8 w-8 text-muted-foreground" />
                ) : (
                  <BookOpen className="h-8 w-8 text-muted-foreground" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">
                      {request.title}
                      {request.author && ` - ${request.author}`}
                    </h3>
                    <p className="text-sm text-muted-foreground">
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
                  </div>
                  <Badge variant={statusVariants[request.status]}>
                    {t(`status.${request.status}`)}
                  </Badge>
                </div>
              </div>

              {/* Actions */}
              {request.status === "pending" && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => onApprove(request.id)}
                    disabled={isApproving}
                  >
                    {isApproving ? <LoadingSpinner size="sm" /> : t("approve")}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" disabled={isRejecting}>
                        {t("reject")}
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onReject(request.id)}>
                        {t("rejectWithoutReason")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRejectClick(request.id)}>
                        {t("rejectWithReason")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Reject with reason dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectDialog.title")}</DialogTitle>
            <DialogDescription>{t("rejectDialog.description")}</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder={t("rejectDialog.placeholder")}
            value={rejectReason}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setRejectReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              {t("rejectDialog.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRejectConfirm}
              disabled={isRejecting}
            >
              {isRejecting ? <LoadingSpinner size="sm" /> : t("rejectDialog.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
