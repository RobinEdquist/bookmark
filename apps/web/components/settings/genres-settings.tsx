"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Tags, Pencil, Trash2, MoreHorizontal } from "lucide-react";
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
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  Dialog,
  DialogContent,
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
import {
  useAdminGenres,
  useRenameGenre,
  useMergeGenres,
  useDeleteGenre,
  type AdminGenre,
  type RenameConflict,
} from "../../lib/use-admin-genres";

export function GenresSettings() {
  const t = useTranslations("settings.genres");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedGenre, setSelectedGenre] = useState<AdminGenre | null>(null);
  const [mergeConflict, setMergeConflict] = useState<RenameConflict | null>(null);

  const { data: genres, isLoading, error } = useAdminGenres();

  const handleRename = (genre: AdminGenre) => {
    setSelectedGenre(genre);
    setRenameDialogOpen(true);
  };

  const handleDelete = (genre: AdminGenre) => {
    setSelectedGenre(genre);
    setDeleteDialogOpen(true);
  };

  const handleRenameConflict = (conflict: RenameConflict) => {
    setMergeConflict(conflict);
    setRenameDialogOpen(false);
    setMergeDialogOpen(true);
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
          <p className="text-destructive">Failed to load genres</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {genres && genres.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead className="text-right">{t("table.audiobooks")}</TableHead>
                  <TableHead className="text-right">{t("table.ebooks")}</TableHead>
                  <TableHead className="text-right">{t("table.comics")}</TableHead>
                  <TableHead className="w-[70px]">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {genres.map((genre) => (
                  <TableRow key={genre.id}>
                    <TableCell className="font-medium">{genre.name}</TableCell>
                    <TableCell className="text-right">{genre.audiobookCount}</TableCell>
                    <TableCell className="text-right">{genre.ebookCount}</TableCell>
                    <TableCell className="text-right">{genre.comicCount}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRename(genre)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("actions.rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(genre)}
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
              <Tags className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium">No genres</h3>
              <p className="text-muted-foreground mt-1 max-w-md">{t("empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <RenameGenreDialog
        genre={selectedGenre}
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        onConflict={handleRenameConflict}
      />

      <MergeGenreDialog
        conflict={mergeConflict}
        open={mergeDialogOpen}
        onOpenChange={setMergeDialogOpen}
      />

      <DeleteGenreDialog
        genre={selectedGenre}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}

// Rename Dialog

interface RenameGenreDialogProps {
  genre: AdminGenre | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConflict: (conflict: RenameConflict) => void;
}

function RenameGenreDialog({
  genre,
  open,
  onOpenChange,
  onConflict,
}: RenameGenreDialogProps) {
  const t = useTranslations("settings.genres.rename");
  const tToast = useTranslations("settings.genres.toast");
  const renameGenre = useRenameGenre();

  const [name, setName] = useState("");

  useEffect(() => {
    if (open && genre) {
      setName(genre.name);
    }
  }, [open, genre]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genre) return;

    try {
      const result = await renameGenre.mutateAsync({ id: genre.id, name });
      if ("conflict" in result && result.conflict) {
        onConflict(result);
      } else {
        toast.success(tToast("renamed"));
        onOpenChange(false);
      }
    } catch {
      toast.error(tToast("error"));
    }
  };

  const isUnchanged = name.trim() === genre?.name;
  const isEmpty = name.trim() === "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="genre-name">{t("label")}</Label>
            <Input
              id="genre-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={renameGenre.isPending || isUnchanged || isEmpty}
            >
              {renameGenre.isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Merge Dialog

interface MergeGenreDialogProps {
  conflict: RenameConflict | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function MergeGenreDialog({ conflict, open, onOpenChange }: MergeGenreDialogProps) {
  const t = useTranslations("settings.genres.merge");
  const tToast = useTranslations("settings.genres.toast");
  const mergeGenres = useMergeGenres();

  const handleMerge = async () => {
    if (!conflict) return;

    try {
      await mergeGenres.mutateAsync({
        sourceId: conflict.sourceGenre.id,
        targetId: conflict.existingGenre.id,
      });
      toast.success(tToast("merged"));
      onOpenChange(false);
    } catch {
      toast.error(tToast("error"));
    }
  };

  if (!conflict) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{t("description", { target: conflict.existingGenre.name })}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  {t("audiobooksFrom", {
                    count: conflict.audiobookCount,
                    source: conflict.sourceGenre.name,
                  })}
                </li>
                <li>
                  {t("ebooksFrom", {
                    count: conflict.ebookCount,
                    source: conflict.sourceGenre.name,
                  })}
                </li>
                <li>
                  {t("comicsFrom", {
                    count: conflict.comicCount,
                    source: conflict.sourceGenre.name,
                  })}
                </li>
              </ul>
              <p>
                {t("into", {
                  target: conflict.existingGenre.name,
                  source: conflict.sourceGenre.name,
                })}
              </p>
              <p className="text-destructive font-medium">{t("warning")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleMerge}
            disabled={mergeGenres.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {mergeGenres.isPending ? t("merging") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Delete Dialog

interface DeleteGenreDialogProps {
  genre: AdminGenre | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function DeleteGenreDialog({ genre, open, onOpenChange }: DeleteGenreDialogProps) {
  const t = useTranslations("settings.genres.delete");
  const tToast = useTranslations("settings.genres.toast");
  const deleteGenre = useDeleteGenre();

  const handleDelete = async () => {
    if (!genre) return;

    try {
      await deleteGenre.mutateAsync(genre.id);
      toast.success(tToast("deleted"));
      onOpenChange(false);
    } catch {
      toast.error(tToast("error"));
    }
  };

  if (!genre) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{t("description", { name: genre.name })}</p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t("audiobooks", { count: genre.audiobookCount })}</li>
                <li>{t("ebooks", { count: genre.ebookCount })}</li>
                <li>{t("comics", { count: genre.comicCount })}</li>
              </ul>
              <p className="text-muted-foreground">{t("note")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleteGenre.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteGenre.isPending ? t("deleting") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
