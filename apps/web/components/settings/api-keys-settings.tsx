"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Key, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import {
  useMyApiKey,
  useCreateApiKey,
  useRevokeApiKey,
  type ApiKeyCreated,
} from "../../lib/use-api-keys";
import { ApiKeyCreatedDialog } from "./api-key-created-dialog";
import { RevokeApiKeyDialog } from "./revoke-api-key-dialog";

export function ApiKeysSettings() {
  const t = useTranslations("preferences.apiKeys");
  const { data: apiKey, isLoading } = useMyApiKey();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const handleGenerate = async () => {
    try {
      const result = await createMutation.mutateAsync();
      setCreatedKey(result);
    } catch {
      toast.error(t("errors.createFailed"));
    }
  };

  const handleRegenerate = () => {
    if (apiKey) {
      setShowRegenerateConfirm(true);
    }
  };

  const confirmRegenerate = async () => {
    setShowRegenerateConfirm(false);
    await handleGenerate();
  };

  const handleRevoke = async () => {
    if (!apiKey) return;
    try {
      await revokeMutation.mutateAsync(apiKey.id);
      setShowRevokeDialog(false);
      toast.success(t("revokeSuccess"));
    } catch {
      toast.error(t("errors.revokeFailed"));
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t("never");
    return new Date(dateString).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-20 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {apiKey ? (
            <div className="space-y-4">
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t("keyLabel")}</span>
                  <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                    {apiKey.start}••••••••
                  </code>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{t("lastUsed")}</span>
                  <span>
                    {apiKey.lastRequest
                      ? `${formatDate(apiKey.lastRequest)}${apiKey.lastIp ? ` from ${apiKey.lastIp}` : ""}`
                      : t("never")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{t("created")}</span>
                  <span>{formatDate(apiKey.createdAt)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleRegenerate}
                  disabled={createMutation.isPending}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t("regenerate")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowRevokeDialog(true)}
                  disabled={revokeMutation.isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t("revoke")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("noKey")}</p>
              <Button
                onClick={handleGenerate}
                disabled={createMutation.isPending}
              >
                <Key className="mr-2 h-4 w-4" />
                {t("generate")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ApiKeyCreatedDialog
        apiKey={createdKey}
        onClose={() => setCreatedKey(null)}
      />

      <RevokeApiKeyDialog
        open={showRevokeDialog}
        onOpenChange={setShowRevokeDialog}
        onConfirm={handleRevoke}
        isLoading={revokeMutation.isPending}
      />

      <RevokeApiKeyDialog
        open={showRegenerateConfirm}
        onOpenChange={setShowRegenerateConfirm}
        onConfirm={confirmRegenerate}
        isLoading={createMutation.isPending}
        isRegenerate
      />
    </>
  );
}
