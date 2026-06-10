"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Key, Plus, Trash2, Copy, Check } from "lucide-react";
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
  useMyApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  ApiKeyLimitError,
  MAX_API_KEYS,
  type ApiKeyCreated,
  type ApiKeyInfo,
} from "../../lib/use-api-keys";
import { ApiKeyCreatedDialog } from "./api-key-created-dialog";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { RevokeApiKeyDialog } from "./revoke-api-key-dialog";

export function ApiKeysSettings() {
  const t = useTranslations("preferences.apiKeys");
  const { data: apiKeys = [], isLoading } = useMyApiKeys();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const [createdKey, setCreatedKey] = useState<ApiKeyCreated | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyInfo | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [urlCopied, setUrlCopied] = useState(false);

  const atLimit = apiKeys.length >= MAX_API_KEYS;

  useEffect(() => {
    setServerUrl(window.location.origin);
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(serverUrl);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleCreate = async (name: string) => {
    try {
      const result = await createMutation.mutateAsync({
        name: name || undefined,
      });
      setShowCreateDialog(false);
      setCreatedKey(result);
    } catch (error) {
      toast.error(
        error instanceof ApiKeyLimitError
          ? t("limitReached")
          : t("errors.createFailed"),
      );
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeMutation.mutateAsync(revokeTarget.id);
      setRevokeTarget(null);
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
          <div className="space-y-4">
            {apiKeys.length > 0 ? (
              <>
                <div className="flex items-center justify-between gap-2 rounded-lg border p-4">
                  <span className="text-sm font-medium">{t("serverUrl")}</span>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-2 py-1 font-mono text-sm truncate max-w-[200px]">
                      {serverUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={handleCopyUrl}
                      aria-label={t("serverUrl")}
                    >
                      {urlCopied ? (
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="space-y-3">
                  {apiKeys.map((apiKey) => (
                    <div
                      key={apiKey.id}
                      className="space-y-2 rounded-lg border p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {apiKey.name}
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
                            {apiKey.start}••••••••
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                            onClick={() => setRevokeTarget(apiKey)}
                            disabled={revokeMutation.isPending}
                            aria-label={t("revoke")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noKeys")}</p>
            )}
            <div className="flex items-center gap-3">
              <Button
                onClick={() => setShowCreateDialog(true)}
                disabled={createMutation.isPending || atLimit}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("create")}
              </Button>
              {apiKeys.length > 0 && (
                <span className="text-sm text-muted-foreground">
                  {t("keyCount", { count: apiKeys.length, max: MAX_API_KEYS })}
                </span>
              )}
            </div>
            {atLimit && (
              <p className="text-sm text-muted-foreground">
                {t("limitReached")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <CreateApiKeyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreate={handleCreate}
        isLoading={createMutation.isPending}
      />

      <ApiKeyCreatedDialog
        apiKey={createdKey}
        onClose={() => setCreatedKey(null)}
      />

      <RevokeApiKeyDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        onConfirm={handleRevoke}
        isLoading={revokeMutation.isPending}
      />
    </>
  );
}
