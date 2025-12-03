"use client";

import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/ui/alert-dialog";

interface RevokeApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isLoading?: boolean;
  isRegenerate?: boolean;
}

export function RevokeApiKeyDialog({
  open,
  onOpenChange,
  onConfirm,
  isLoading,
  isRegenerate,
}: RevokeApiKeyDialogProps) {
  const t = useTranslations("preferences.apiKeys.revokeDialog");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isRegenerate ? t("regenerateTitle") : t("title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isRegenerate ? t("regenerateDescription") : t("description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isLoading}>
            {isRegenerate ? t("regenerateConfirm") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
