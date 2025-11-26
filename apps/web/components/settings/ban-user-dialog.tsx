"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { useBanUser, type User } from "../../lib/use-users";

interface BanUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BanUserDialog({ user, open, onOpenChange }: BanUserDialogProps) {
  const t = useTranslations("settings.users");
  const banUser = useBanUser();

  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const resetForm = () => {
    setReason("");
    setExpiresAt("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await banUser.mutateAsync({
        id: user.id,
        data: {
          reason: reason || undefined,
          expiresAt: expiresAt || undefined,
        },
      });
      toast.success(t("toast.banSuccess"));
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.banError")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("banDialog.title")}</DialogTitle>
          <DialogDescription>{t("banDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ban-reason">{t("banDialog.reason")}</Label>
            <Input
              id="ban-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("banDialog.reasonPlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ban-expires">{t("banDialog.expires")}</Label>
            <Input
              id="ban-expires"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("banDialog.permanent")}
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={banUser.isPending}
            >
              {banUser.isPending
                ? t("banDialog.banning")
                : t("banDialog.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
