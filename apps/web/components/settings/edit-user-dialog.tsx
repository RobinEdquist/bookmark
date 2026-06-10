"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Switch } from "@repo/ui/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { MultiSelect } from "@repo/ui/components/ui/multi-select";
import { useUpdateUser, type User } from "../../lib/use-users";
import { useTags } from "../../lib/use-tags";
import {
  useRevokeUserApiKey,
  useRevokeUserApiKeyById,
  useUserApiKeys,
} from "../../lib/use-api-keys";
import { useSettings } from "../../lib/use-settings";

interface EditUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const t = useTranslations("settings.users");
  const updateUser = useUpdateUser();
  const revokeUserApiKey = useRevokeUserApiKey();
  const revokeUserApiKeyById = useRevokeUserApiKeyById();
  const { data: userApiKeys = [] } = useUserApiKeys(user?.id, open);
  const { data: availableTags = [] } = useTags();
  const { settings } = useSettings();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEditMetadata, setCanEditMetadata] = useState(false);
  const [canUpload, setCanUploadAudiobooks] = useState(false);
  const [canDelete, setCanDeleteAudiobooks] = useState(false);
  const [canGenerateApiKeys, setCanGenerateApiKeys] = useState(false);
  const [canRequestContent, setCanRequestContent] = useState(false);
  const [blacklistedTags, setBlacklistedTags] = useState<string[]>([]);
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setIsAdmin(user.role === "admin");
      setCanEditMetadata(user.permissions.canEditMetadata);
      setCanUploadAudiobooks(user.permissions.canUpload);
      setCanDeleteAudiobooks(user.permissions.canDelete);
      setCanGenerateApiKeys(user.permissions.canGenerateApiKeys);
      setCanRequestContent(user.permissions.canRequestContent);
      setBlacklistedTags(user.blacklistedTags);
    }
  }, [user]);

  // Admins have all permissions and no blacklisted tags
  useEffect(() => {
    if (isAdmin) {
      setCanEditMetadata(true);
      setCanUploadAudiobooks(true);
      setCanDeleteAudiobooks(true);
      setCanGenerateApiKeys(true);
      setCanRequestContent(true);
      setBlacklistedTags([]);
    }
  }, [isAdmin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: {
          name,
          email,
          isAdmin,
          canEditMetadata,
          canUpload,
          canDelete,
          canGenerateApiKeys,
          canRequestContent,
          blacklistedTags,
        },
      });
      toast.success(t("toast.updateSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.updateError")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t("createDialog.name")}</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-email">{t("createDialog.email")}</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="edit-isAdmin">{t("createDialog.role")}</Label>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${!isAdmin ? "font-medium" : "text-muted-foreground"}`}>
                {t("createDialog.roleUser")}
              </span>
              <Switch
                id="edit-isAdmin"
                checked={isAdmin}
                onCheckedChange={setIsAdmin}
              />
              <span className={`text-sm ${isAdmin ? "font-medium" : "text-muted-foreground"}`}>
                {t("createDialog.roleAdmin")}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Label>{t("createDialog.permissions")}</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="edit-canEditMetadata" className="font-normal">
                  {t("createDialog.canEditMetadata")}
                </Label>
                <Switch
                  id="edit-canEditMetadata"
                  checked={canEditMetadata}
                  onCheckedChange={setCanEditMetadata}
                  disabled={isAdmin}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="edit-canUpload" className="font-normal">
                  {t("createDialog.canUpload")}
                </Label>
                <Switch
                  id="edit-canUpload"
                  checked={canUpload}
                  onCheckedChange={setCanUploadAudiobooks}
                  disabled={isAdmin}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="edit-canDelete" className="font-normal">
                  {t("createDialog.canDelete")}
                </Label>
                <Switch
                  id="edit-canDelete"
                  checked={canDelete}
                  onCheckedChange={setCanDeleteAudiobooks}
                  disabled={isAdmin}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="edit-canGenerateApiKeys" className="font-normal">
                  {t("createDialog.canGenerateApiKeys")}
                </Label>
                <Switch
                  id="edit-canGenerateApiKeys"
                  checked={canGenerateApiKeys}
                  onCheckedChange={setCanGenerateApiKeys}
                  disabled={isAdmin}
                />
              </div>
              {settings?.requestsEnabled && (
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label htmlFor="edit-canRequestContent" className="font-normal">
                    {t("createDialog.canRequestContent")}
                  </Label>
                  <Switch
                    id="edit-canRequestContent"
                    checked={canRequestContent}
                    onCheckedChange={setCanRequestContent}
                    disabled={isAdmin}
                  />
                </div>
              )}
            </div>
          </div>

          {!isAdmin && (
            <div className="space-y-2">
              <Label>{t("createDialog.blacklistedTags")}</Label>
              <MultiSelect
                options={availableTags}
                selected={blacklistedTags}
                onChange={setBlacklistedTags}
                placeholder={t("createDialog.blacklistedTagsPlaceholder")}
                searchPlaceholder={t("createDialog.searchTags")}
                emptyText={t("createDialog.noTagsAvailable")}
              />
            </div>
          )}

          {user && userApiKeys.length > 0 && (
            <div className="space-y-2">
              <Label>{t("apiKeySection.title")}</Label>
              <div className="space-y-2">
                {userApiKeys.map((key) => (
                  <div key={key.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {key.name}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-destructive hover:text-destructive"
                        onClick={async () => {
                          try {
                            await revokeUserApiKeyById.mutateAsync({
                              userId: user.id,
                              keyId: key.id,
                            });
                            toast.success(t("apiKeySection.revokeSuccess"));
                          } catch {
                            toast.error(t("apiKeySection.revokeError"));
                          }
                        }}
                        disabled={revokeUserApiKeyById.isPending}
                      >
                        {t("apiKeySection.revoke")}
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {t("apiKeySection.lastUsed")}
                      </span>
                      <span className="text-sm">
                        {key.lastRequest
                          ? new Date(key.lastRequest).toLocaleDateString()
                          : t("apiKeySection.never")}
                      </span>
                    </div>
                    {key.lastIp && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          {t("apiKeySection.lastIp")}
                        </span>
                        <span className="text-sm font-mono">{key.lastIp}</span>
                      </div>
                    )}
                  </div>
                ))}
                {userApiKeys.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        await revokeUserApiKey.mutateAsync(user.id);
                        toast.success(t("apiKeySection.revokeAllSuccess"));
                      } catch {
                        toast.error(t("apiKeySection.revokeError"));
                      }
                    }}
                    disabled={revokeUserApiKey.isPending}
                  >
                    {t("apiKeySection.revokeAll")}
                  </Button>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending
                ? t("editDialog.saving")
                : t("editDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
