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
import { useUpdateUser, type User } from "../../lib/use-users";

interface EditUserDialogProps {
  user: User | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const t = useTranslations("settings.users");
  const updateUser = useUpdateUser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEditMetadata, setCanEditMetadata] = useState(false);
  const [canUploadAudiobooks, setCanUploadAudiobooks] = useState(false);
  const [canDeleteAudiobooks, setCanDeleteAudiobooks] = useState(false);
  const [canGenerateApiKeys, setCanGenerateApiKeys] = useState(false);
  const [blacklistedTags, setBlacklistedTags] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setIsAdmin(user.role === "admin");
      setCanEditMetadata(user.permissions.canEditMetadata);
      setCanUploadAudiobooks(user.permissions.canUploadAudiobooks);
      setCanDeleteAudiobooks(user.permissions.canDeleteAudiobooks);
      setCanGenerateApiKeys(user.permissions.canGenerateApiKeys);
      setBlacklistedTags(user.blacklistedTags.join(", "));
    }
  }, [user]);

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
          canUploadAudiobooks,
          canDeleteAudiobooks,
          canGenerateApiKeys,
          blacklistedTags: blacklistedTags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
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
            <Label htmlFor="edit-isAdmin">{t("createDialog.makeAdmin")}</Label>
            <Switch
              id="edit-isAdmin"
              checked={isAdmin}
              onCheckedChange={setIsAdmin}
            />
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
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="edit-canUploadAudiobooks" className="font-normal">
                  {t("createDialog.canUploadAudiobooks")}
                </Label>
                <Switch
                  id="edit-canUploadAudiobooks"
                  checked={canUploadAudiobooks}
                  onCheckedChange={setCanUploadAudiobooks}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="edit-canDeleteAudiobooks" className="font-normal">
                  {t("createDialog.canDeleteAudiobooks")}
                </Label>
                <Switch
                  id="edit-canDeleteAudiobooks"
                  checked={canDeleteAudiobooks}
                  onCheckedChange={setCanDeleteAudiobooks}
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
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-blacklistedTags">
              {t("createDialog.blacklistedTags")}
            </Label>
            <Input
              id="edit-blacklistedTags"
              value={blacklistedTags}
              onChange={(e) => setBlacklistedTags(e.target.value)}
              placeholder={t("createDialog.blacklistedTagsPlaceholder")}
            />
          </div>

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
