"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/ui/dialog";
import { Button } from "@repo/ui/components/ui/button";
import type { ApiKeyCreated } from "../../lib/use-api-keys";

interface ApiKeyCreatedDialogProps {
  apiKey: ApiKeyCreated | null;
  onClose: () => void;
}

export function ApiKeyCreatedDialog({
  apiKey,
  onClose,
}: ApiKeyCreatedDialogProps) {
  const t = useTranslations("preferences.apiKeys.createdDialog");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!apiKey) return;
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={!!apiKey} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            {t("warning")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
            <code className="flex-1 break-all font-mono text-sm">
              {apiKey?.key}
            </code>
            <Button variant="ghost" size="icon" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">{t("instructions")}</p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
