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
import { useCreateUser } from "../../lib/use-users";
import { useTags } from "../../lib/use-tags";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const t = useTranslations("settings.users");
  const createUser = useCreateUser();
  const { data: availableTags = [] } = useTags();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [canEditMetadata, setCanEditMetadata] = useState(false);
  const [canUploadAudiobooks, setCanUploadAudiobooks] = useState(false);
  const [canDeleteAudiobooks, setCanDeleteAudiobooks] = useState(false);
  const [canGenerateApiKeys, setCanGenerateApiKeys] = useState(false);
  const [blacklistedTags, setBlacklistedTags] = useState<string[]>([]);

  // Admins have all permissions and no blacklisted tags
  useEffect(() => {
    if (isAdmin) {
      setCanEditMetadata(true);
      setCanUploadAudiobooks(true);
      setCanDeleteAudiobooks(true);
      setCanGenerateApiKeys(true);
      setBlacklistedTags([]);
    }
  }, [isAdmin]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setIsAdmin(false);
    setCanEditMetadata(false);
    setCanUploadAudiobooks(false);
    setCanDeleteAudiobooks(false);
    setCanGenerateApiKeys(false);
    setBlacklistedTags([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createUser.mutateAsync({
        name,
        email,
        password,
        isAdmin,
        canEditMetadata,
        canUploadAudiobooks,
        canDeleteAudiobooks,
        canGenerateApiKeys,
        blacklistedTags,
      });
      toast.success(t("toast.createSuccess"));
      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toast.createError")
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("createDialog.name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("createDialog.namePlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("createDialog.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("createDialog.emailPlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("createDialog.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("createDialog.passwordPlaceholder")}
              minLength={8}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("createDialog.passwordHint")}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="isAdmin">{t("createDialog.role")}</Label>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${!isAdmin ? "font-medium" : "text-muted-foreground"}`}>
                {t("createDialog.roleUser")}
              </span>
              <Switch
                id="isAdmin"
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
                <Label htmlFor="canEditMetadata" className="font-normal">
                  {t("createDialog.canEditMetadata")}
                </Label>
                <Switch
                  id="canEditMetadata"
                  checked={canEditMetadata}
                  onCheckedChange={setCanEditMetadata}
                  disabled={isAdmin}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="canUploadAudiobooks" className="font-normal">
                  {t("createDialog.canUploadAudiobooks")}
                </Label>
                <Switch
                  id="canUploadAudiobooks"
                  checked={canUploadAudiobooks}
                  onCheckedChange={setCanUploadAudiobooks}
                  disabled={isAdmin}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="canDeleteAudiobooks" className="font-normal">
                  {t("createDialog.canDeleteAudiobooks")}
                </Label>
                <Switch
                  id="canDeleteAudiobooks"
                  checked={canDeleteAudiobooks}
                  onCheckedChange={setCanDeleteAudiobooks}
                  disabled={isAdmin}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <Label htmlFor="canGenerateApiKeys" className="font-normal">
                  {t("createDialog.canGenerateApiKeys")}
                </Label>
                <Switch
                  id="canGenerateApiKeys"
                  checked={canGenerateApiKeys}
                  onCheckedChange={setCanGenerateApiKeys}
                  disabled={isAdmin}
                />
              </div>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending
                ? t("createDialog.creating")
                : t("createDialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
