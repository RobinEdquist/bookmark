"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Megaphone, Pencil, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { Switch } from "@repo/ui/components/ui/switch";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Badge } from "@repo/ui/components/ui/badge";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  type AdminAnnouncement,
} from "../../lib/use-announcements";

export function AnnouncementsSettings() {
  const t = useTranslations("settings.announcements");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] =
    useState<AdminAnnouncement | null>(null);

  const { data: announcements, isLoading, error } = useAdminAnnouncements();
  const updateAnnouncement = useUpdateAnnouncement();

  const handleEdit = (announcement: AdminAnnouncement) => {
    setSelectedAnnouncement(announcement);
    setEditDialogOpen(true);
  };

  const handleDelete = (announcement: AdminAnnouncement) => {
    setSelectedAnnouncement(announcement);
    setDeleteDialogOpen(true);
  };

  const handleToggleActive = async (announcement: AdminAnnouncement) => {
    try {
      await updateAnnouncement.mutateAsync({
        id: announcement.id,
        isActive: !announcement.isActive,
      });
      toast.success(t("toast.updateSuccess"));
    } catch {
      toast.error(t("toast.updateError"));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <LoadingSpinner size="lg" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="text-destructive">Failed to load announcements</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              {t("createAnnouncement")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {announcements && announcements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.title")}</TableHead>
                  <TableHead>{t("table.message")}</TableHead>
                  <TableHead>{t("table.status")}</TableHead>
                  <TableHead>{t("table.createdAt")}</TableHead>
                  <TableHead className="w-[70px]">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {announcements.map((announcement) => (
                  <TableRow key={announcement.id}>
                    <TableCell className="font-medium">
                      {announcement.title}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">
                      {announcement.message}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={announcement.isActive ? "default" : "secondary"}
                      >
                        {announcement.isActive
                          ? t("status.active")
                          : t("status.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(announcement.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(announcement)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("actions.edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(announcement)}
                          >
                            <Megaphone className="mr-2 h-4 w-4" />
                            {announcement.isActive
                              ? t("actions.deactivate")
                              : t("actions.activate")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(announcement)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Megaphone className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">{t("noAnnouncements")}</h3>
              <p className="text-muted-foreground mt-1 max-w-md">
                {t("noAnnouncementsDescription")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <CreateAnnouncementDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />

      <EditAnnouncementDialog
        announcement={selectedAnnouncement}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />

      <DeleteAnnouncementDialog
        announcement={selectedAnnouncement}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}

// Create Dialog

interface CreateAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateAnnouncementDialog({
  open,
  onOpenChange,
}: CreateAnnouncementDialogProps) {
  const t = useTranslations("settings.announcements");
  const createAnnouncement = useCreateAnnouncement();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => {
    setTitle("");
    setMessage("");
    setIsActive(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createAnnouncement.mutateAsync({
        title,
        message,
        isActive,
      });
      toast.success(t("toast.createSuccess"));
      resetForm();
      onOpenChange(false);
    } catch {
      toast.error(t("toast.createError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createDialog.title")}</DialogTitle>
          <DialogDescription>{t("createDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="create-title">{t("createDialog.titleLabel")}</Label>
            <Input
              id="create-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("createDialog.titlePlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-message">{t("createDialog.messageLabel")}</Label>
            <Textarea
              id="create-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("createDialog.messagePlaceholder")}
              rows={3}
              required
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="create-active">{t("createDialog.isActiveLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("createDialog.isActiveDescription")}
              </p>
            </div>
            <Switch
              id="create-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createAnnouncement.isPending}>
              {createAnnouncement.isPending
                ? t("createDialog.creating")
                : t("createDialog.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Edit Dialog

interface EditAnnouncementDialogProps {
  announcement: AdminAnnouncement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditAnnouncementDialog({
  announcement,
  open,
  onOpenChange,
}: EditAnnouncementDialogProps) {
  const t = useTranslations("settings.announcements");
  const updateAnnouncement = useUpdateAnnouncement();

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Populate form when dialog opens with announcement data
  useEffect(() => {
    if (open && announcement) {
      setTitle(announcement.title);
      setMessage(announcement.message);
      setIsActive(announcement.isActive);
    }
  }, [open, announcement]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!announcement) return;

    try {
      await updateAnnouncement.mutateAsync({
        id: announcement.id,
        title,
        message,
        isActive,
      });
      toast.success(t("toast.updateSuccess"));
      onOpenChange(false);
    } catch {
      toast.error(t("toast.updateError"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
          <DialogDescription>{t("editDialog.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">{t("createDialog.titleLabel")}</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("createDialog.titlePlaceholder")}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-message">{t("createDialog.messageLabel")}</Label>
            <Textarea
              id="edit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t("createDialog.messagePlaceholder")}
              rows={3}
              required
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="edit-active">{t("createDialog.isActiveLabel")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("createDialog.isActiveDescription")}
              </p>
            </div>
            <Switch
              id="edit-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateAnnouncement.isPending}>
              {updateAnnouncement.isPending
                ? t("editDialog.saving")
                : t("editDialog.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Delete Dialog

interface DeleteAnnouncementDialogProps {
  announcement: AdminAnnouncement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DeleteAnnouncementDialog({
  announcement,
  open,
  onOpenChange,
}: DeleteAnnouncementDialogProps) {
  const t = useTranslations("settings.announcements");
  const deleteAnnouncement = useDeleteAnnouncement();

  const handleDelete = async () => {
    if (!announcement) return;

    try {
      await deleteAnnouncement.mutateAsync(announcement.id);
      toast.success(t("toast.deleteSuccess"));
      onOpenChange(false);
    } catch {
      toast.error(t("toast.deleteError"));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("deleteDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteAnnouncement.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteAnnouncement.isPending
              ? t("deleteDialog.deleting")
              : t("deleteDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
