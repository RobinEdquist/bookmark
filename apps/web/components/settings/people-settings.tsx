"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Pencil,
  Scissors,
  Users,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/ui/card";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@repo/ui/components/ui/dialog";
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
  CreatableCombobox,
} from "@repo/ui/components/ui/creatable-combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/ui/table";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import {
  useAdminPeople,
  useMergePeople,
  useRenamePerson,
  useSplitPersonMutation,
  type AdminPerson,
  type RenameConflict,
} from "../../lib/use-admin-people";

type PeopleRole = "authors" | "narrators";

interface PeopleSettingsProps {
  role: PeopleRole;
}

export function PeopleSettings({ role }: PeopleSettingsProps) {
  const t = useTranslations(
    role === "authors" ? "settings.authors" : "settings.narrators",
  );
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 250);
  const { data: people, isLoading, error } = useAdminPeople(
    role,
    debouncedSearch || undefined,
  );

  const [selectedPerson, setSelectedPerson] = useState<AdminPerson | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [renameConflict, setRenameConflict] = useState<RenameConflict | null>(
    null,
  );

  const personNames = useMemo(
    () => (people ?? []).map((person) => person.name),
    [people],
  );

  const handleRename = (person: AdminPerson) => {
    setSelectedPerson(person);
    setRenameOpen(true);
  };

  const handleSplit = (person: AdminPerson) => {
    setSelectedPerson(person);
    setSplitOpen(true);
  };

  const handleRenameConflict = (conflict: RenameConflict) => {
    setRenameConflict(conflict);
    setRenameOpen(false);
    setMergeOpen(true);
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
          <p className="text-destructive">{t("loadError")}</p>
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
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full max-w-md space-y-2">
              <Label htmlFor={`${role}-search`}>{t("searchLabel")}</Label>
              <Input
                id={`${role}-search`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {people?.length ?? 0} {t("peopleCount")}
            </div>
          </div>

          {people && people.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead className="text-right">
                    {t("table.audiobooks")}
                  </TableHead>
                  {role === "authors" && (
                    <TableHead className="text-right">
                      {t("table.ebooks")}
                    </TableHead>
                  )}
                  <TableHead className="w-[70px]">{t("table.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="font-medium">{person.name}</TableCell>
                    <TableCell className="text-right">
                      {role === "authors"
                        ? person.audiobookAuthorCount
                        : person.audiobookNarratorCount}
                    </TableCell>
                    {role === "authors" && (
                      <TableCell className="text-right">
                        {person.ebookAuthorCount}
                      </TableCell>
                    )}
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">{t("table.actions")}</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleRename(person)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {t("actions.rename")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSplit(person)}>
                            <Scissors className="mr-2 h-4 w-4" />
                            {t("actions.split")}
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
              <Users className="mb-4 h-12 w-12 text-muted-foreground/50" />
              <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
              <p className="mt-1 max-w-md text-muted-foreground">
                {t("empty")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <RenamePersonDialog
        person={selectedPerson}
        open={renameOpen}
        onOpenChange={setRenameOpen}
        onConflict={handleRenameConflict}
        role={role}
      />

      <MergePersonDialog
        conflict={renameConflict}
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        role={role}
      />

      <SplitPersonDialog
        person={selectedPerson}
        open={splitOpen}
        onOpenChange={setSplitOpen}
        role={role}
        names={personNames}
      />
    </div>
  );
}

interface RenamePersonDialogProps {
  person: AdminPerson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConflict: (conflict: RenameConflict) => void;
  role: PeopleRole;
}

function RenamePersonDialog({
  person,
  open,
  onOpenChange,
  onConflict,
  role,
}: RenamePersonDialogProps) {
  const t = useTranslations(
    role === "authors" ? "settings.authors.rename" : "settings.narrators.rename",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {person && (
          <RenamePersonForm
            person={person}
            onOpenChange={onOpenChange}
            onConflict={onConflict}
            role={role}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Split out so opening the dialog creates the form's state rather than an effect
 * re-syncing it. DialogContent unmounts while closed, so this mounts fresh each
 * time and useState seeds from the person being renamed.
 */
function RenamePersonForm({
  person,
  onOpenChange,
  onConflict,
  role,
}: {
  person: AdminPerson;
  onOpenChange: (open: boolean) => void;
  onConflict: (conflict: RenameConflict) => void;
  role: PeopleRole;
}) {
  const t = useTranslations(
    role === "authors" ? "settings.authors.rename" : "settings.narrators.rename",
  );
  const tToast = useTranslations(
    role === "authors" ? "settings.authors.toast" : "settings.narrators.toast",
  );
  const renamePerson = useRenamePerson();
  const [name, setName] = useState(person.name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await renamePerson.mutateAsync({ id: person.id, name });
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="person-name">{t("label")}</Label>
        <Input
          id="person-name"
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
        <Button type="submit" disabled={renamePerson.isPending}>
          {renamePerson.isPending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface MergePersonDialogProps {
  conflict: RenameConflict | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: PeopleRole;
}

function MergePersonDialog({
  conflict,
  open,
  onOpenChange,
  role,
}: MergePersonDialogProps) {
  const t = useTranslations(
    role === "authors" ? "settings.authors.merge" : "settings.narrators.merge",
  );
  const tToast = useTranslations(
    role === "authors" ? "settings.authors.toast" : "settings.narrators.toast",
  );
  const mergePeople = useMergePeople();

  const handleMerge = async () => {
    if (!conflict) return;

    try {
      await mergePeople.mutateAsync({
        sourceId: conflict.sourcePerson.id,
        targetId: conflict.existingPerson.id,
      });
      toast.success(tToast("merged"));
      onOpenChange(false);
    } catch {
      toast.error(tToast("error"));
    }
  };

  const sourceCount =
    role === "authors"
      ? conflict
        ? conflict.audiobookAuthorCount + conflict.ebookAuthorCount
        : 0
      : conflict?.audiobookNarratorCount ?? 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {conflict
              ? t("description", {
                  target: conflict.existingPerson.name,
                })
              : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {conflict && (
          <div className="space-y-2 text-sm">
            <p>{t("source", { source: conflict.sourcePerson.name, count: sourceCount })}</p>
            {role === "authors" && (
              <>
                <p>
                  {t("audiobooks", {
                    count: conflict.audiobookAuthorCount,
                    source: conflict.sourcePerson.name,
                  })}
                </p>
                <p>
                  {t("ebooks", {
                    count: conflict.ebookAuthorCount,
                    source: conflict.sourcePerson.name,
                  })}
                </p>
              </>
            )}
            {role === "narrators" && (
              <p>
                {t("audiobooks", {
                  count: conflict.audiobookNarratorCount,
                  source: conflict.sourcePerson.name,
                })}
              </p>
            )}
            <p className="text-muted-foreground">{t("warning")}</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handleMerge} disabled={mergePeople.isPending}>
            {mergePeople.isPending ? t("merging") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface SplitPersonDialogProps {
  person: AdminPerson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: PeopleRole;
  names: string[];
}

function SplitPersonDialog({
  person,
  open,
  onOpenChange,
  role,
  names,
}: SplitPersonDialogProps) {
  const t = useTranslations(
    role === "authors" ? "settings.authors.split" : "settings.narrators.split",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {person && (
          <SplitPersonForm
            person={person}
            onOpenChange={onOpenChange}
            role={role}
            names={names}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Split out so the selection starts empty because the form is new, not because
 * an effect cleared it. DialogContent unmounts while closed, so every open gets
 * a fresh mount — the effect this replaces set `[]` in both of its branches,
 * i.e. it existed only to undo state that outlived the dialog.
 */
function SplitPersonForm({
  person,
  onOpenChange,
  role,
  names,
}: {
  person: AdminPerson;
  onOpenChange: (open: boolean) => void;
  role: PeopleRole;
  names: string[];
}) {
  const t = useTranslations(
    role === "authors" ? "settings.authors.split" : "settings.narrators.split",
  );
  const tToast = useTranslations(
    role === "authors" ? "settings.authors.toast" : "settings.narrators.toast",
  );
  const splitPerson = useSplitPersonMutation();
  const [replacementNames, setReplacementNames] = useState<string[]>([]);

  const options = names
    .filter((name) => name !== person.name)
    .map((name) => ({ value: name, label: name }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await splitPerson.mutateAsync({
        id: person.id,
        names: replacementNames,
      });
      toast.success(tToast("split"));
      onOpenChange(false);
    } catch {
      toast.error(tToast("error"));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="space-y-2">
        <Label>{t("label")}</Label>
        <CreatableCombobox
          options={options}
          value={replacementNames}
          onChange={setReplacementNames}
          placeholder={t("placeholder")}
          searchPlaceholder={t("searchPlaceholder")}
          emptyText={t("empty")}
          createText={t("create")}
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
          disabled={splitPerson.isPending || replacementNames.length < 2}
        >
          {splitPerson.isPending ? t("splitting") : t("confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}
