"use client";

import { useState } from "react";
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

export function EditUserDialog({
  user,
  open,
  onOpenChange,
}: EditUserDialogProps) {
  const t = useTranslations("settings.users");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>
        {user && <EditUserForm user={user} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Split out so opening the dialog creates the form's state instead of an effect
 * re-syncing it. DialogContent unmounts while closed, so this mounts fresh each
 * time and every field seeds directly from the user being edited.
 */
function EditUserForm({
  user,
  onOpenChange,
}: {
  user: User;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("settings.users");
  const updateUser = useUpdateUser();
  const revokeUserApiKey = useRevokeUserApiKey();
  const revokeUserApiKeyById = useRevokeUserApiKeyById();
  // Only mounted while the dialog is open, so the query is unconditionally on.
  const { data: userApiKeys = [] } = useUserApiKeys(user.id, true);
  const { data: availableTags = [] } = useTags();
  const { settings } = useSettings();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [isAdmin, setIsAdmin] = useState(user.role === "admin");

  // What the operator has ticked, before the admin role is applied on top.
  const [editMetadataChoice, setEditMetadataChoice] = useState(
    user.permissions.canEditMetadata,
  );
  const [uploadChoice, setUploadChoice] = useState(user.permissions.canUpload);
  const [deleteChoice, setDeleteChoice] = useState(user.permissions.canDelete);
  const [apiKeysChoice, setApiKeysChoice] = useState(
    user.permissions.canGenerateApiKeys,
  );
  const [requestChoice, setRequestChoice] = useState(
    user.permissions.canRequestContent,
  );
  const [generateChoice, setGenerateChoice] = useState(
    user.permissions.canGenerateAudiobooks,
  );
  const [tagChoice, setTagChoice] = useState<string[]>(user.blacklistedTags);

  // Admins implicitly hold every permission and have no tag blacklist, and the
  // individual controls are disabled while the role is admin. Deriving that,
  // rather than forcing each flag true from an effect, fixes a real bug: the
  // effect only fired when isAdmin *became* true, so demoting an admin back to
  // user left every permission stuck on rather than revealing what they had.
  const canEditMetadata = isAdmin || editMetadataChoice;
  const canUpload = isAdmin || uploadChoice;
  const canDelete = isAdmin || deleteChoice;
  const canGenerateApiKeys = isAdmin || apiKeysChoice;
  const canRequestContent = isAdmin || requestChoice;
  const canGenerateAudiobooks = isAdmin || generateChoice;
  const blacklistedTags = isAdmin ? [] : tagChoice;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
          canGenerateAudiobooks,
          blacklistedTags,
        },
      });
      toast.success(t("toast.updateSuccess"));
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.updateError"),
      );
    }
  };

  return (
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
          <span
            className={`text-sm ${!isAdmin ? "font-medium" : "text-muted-foreground"}`}
          >
            {t("createDialog.roleUser")}
          </span>
          <Switch
            id="edit-isAdmin"
            checked={isAdmin}
            onCheckedChange={setIsAdmin}
          />
          <span
            className={`text-sm ${isAdmin ? "font-medium" : "text-muted-foreground"}`}
          >
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
              onCheckedChange={setEditMetadataChoice}
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
              onCheckedChange={setUploadChoice}
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
              onCheckedChange={setDeleteChoice}
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
              onCheckedChange={setApiKeysChoice}
              disabled={isAdmin}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="edit-canGenerateAudiobooks" className="font-normal">
              {t("createDialog.canGenerateAudiobooks")}
            </Label>
            <Switch
              id="edit-canGenerateAudiobooks"
              checked={canGenerateAudiobooks}
              onCheckedChange={setGenerateChoice}
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
                onCheckedChange={setRequestChoice}
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
            onChange={setTagChoice}
            placeholder={t("createDialog.blacklistedTagsPlaceholder")}
            searchPlaceholder={t("createDialog.searchTags")}
            emptyText={t("createDialog.noTagsAvailable")}
          />
        </div>
      )}

      {userApiKeys.length > 0 && (
        <div className="space-y-2">
          <Label>{t("apiKeySection.title")}</Label>
          <div className="space-y-2">
            {userApiKeys.map((key) => (
              <div key={key.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {key.name ?? t("apiKeySection.unnamedKey")}
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
                    disabled={
                      revokeUserApiKeyById.isPending &&
                      revokeUserApiKeyById.variables?.keyId === key.id
                    }
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
                disabled={
                  revokeUserApiKey.isPending || revokeUserApiKeyById.isPending
                }
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
          {updateUser.isPending ? t("editDialog.saving") : t("editDialog.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
