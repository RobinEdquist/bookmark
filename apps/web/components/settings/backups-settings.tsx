"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Archive,
  Download,
  HardDriveDownload,
  Loader2,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { Switch } from "@repo/ui/components/ui/switch";
import { formatFileSize } from "../../lib/format-file-size";
import { BackupEntry, useBackups } from "../../lib/use-backups";

type Frequency = "daily" | "weekly" | "monthly";

interface ScheduleFields {
  frequency: Frequency;
  time: string;
  weekday: string;
  monthDay: string;
}

interface BackupDraft {
  enabled: boolean;
  path: string;
  retention: string;
  schedule: ScheduleFields;
}

const WEEKDAYS = ["0", "1", "2", "3", "4", "5", "6"];

function parseSchedule(schedule: string): ScheduleFields {
  const parts = schedule.trim().split(/\s+/);
  const minute = Number(parts[0]);
  const hour = Number(parts[1]);
  const time =
    Number.isInteger(hour) && Number.isInteger(minute)
      ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      : "02:00";

  if (parts.length === 5 && parts[2] === "*" && parts[3] === "*") {
    if (WEEKDAYS.includes(parts[4] ?? "")) {
      return {
        frequency: "weekly",
        time,
        weekday: parts[4] ?? "0",
        monthDay: "1",
      };
    }
    if (parts[4] === "*") {
      return {
        frequency: "daily",
        time,
        weekday: "0",
        monthDay: "1",
      };
    }
  }

  if (
    parts.length === 5 &&
    /^([1-9]|[12]\d|3[01])$/.test(parts[2] ?? "") &&
    parts[3] === "*" &&
    parts[4] === "*"
  ) {
    return {
      frequency: "monthly",
      time,
      weekday: "0",
      monthDay: parts[2] ?? "1",
    };
  }

  return { frequency: "daily", time: "02:00", weekday: "0", monthDay: "1" };
}

function formatNextBackup(
  iso: string,
  timeZone: string,
): { date: string; timezone: string } {
  const date = new Date(iso);
  const options = { dateStyle: "medium", timeStyle: "short" } as const;
  try {
    return {
      date: new Intl.DateTimeFormat(undefined, { ...options, timeZone }).format(
        date,
      ),
      timezone: timeZone,
    };
  } catch {
    // The server timezone comes from the TZ env var and is not always a name
    // Intl accepts (e.g. "UTC+8"); fall back to the viewer's own timezone
    // rather than crashing the whole tab.
    return {
      date: new Intl.DateTimeFormat(undefined, options).format(date),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function serializeSchedule(fields: ScheduleFields): string {
  const [hour, minute] = fields.time.split(":").map(Number);
  if (fields.frequency === "weekly") {
    return `${minute} ${hour} * * ${fields.weekday}`;
  }
  if (fields.frequency === "monthly") {
    return `${minute} ${hour} ${fields.monthDay} * *`;
  }
  return `${minute} ${hour} * * *`;
}

export function BackupsSettings() {
  const t = useTranslations("settings.backups");
  const {
    overview,
    updateConfig,
    createBackup,
    uploadBackup,
    deleteBackup,
    restoreBackup,
  } = useBackups();
  const [draft, setDraft] = useState<BackupDraft | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupEntry | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [restarting, setRestarting] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const config = overview.data?.config;
  const backups = overview.data?.backups ?? [];
  const form: BackupDraft =
    draft ??
    (config
      ? {
          enabled: config.enabled,
          path: config.path,
          retention: String(config.retention),
          schedule: parseSchedule(config.schedule),
        }
      : {
          enabled: false,
          path: "",
          retention: "7",
          schedule: parseSchedule("0 2 * * *"),
        });
  const nextBackup = config?.nextBackupAt
    ? formatNextBackup(config.nextBackupAt, config.timezone)
    : null;

  const updateDraft = (updates: Partial<BackupDraft>) => {
    setDraft((current) => ({ ...(current ?? form), ...updates }));
  };

  const updateSchedule = (updates: Partial<ScheduleFields>) => {
    updateDraft({ schedule: { ...form.schedule, ...updates } });
  };

  const handleSave = async () => {
    const retentionNumber = Number(form.retention);
    if (
      !Number.isInteger(retentionNumber) ||
      retentionNumber < 1 ||
      retentionNumber > 99
    ) {
      toast.error(t("toasts.invalidRetention"));
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.schedule.time)) {
      toast.error(t("toasts.invalidSchedule"));
      return;
    }
    const monthDay = Number(form.schedule.monthDay);
    if (
      form.schedule.frequency === "monthly" &&
      (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 28)
    ) {
      toast.error(t("toasts.invalidSchedule"));
      return;
    }

    try {
      await updateConfig.mutateAsync({
        enabled: form.enabled,
        path: config?.pathLocked ? undefined : form.path.trim() || null,
        schedule: serializeSchedule(form.schedule),
        retention: retentionNumber,
      });
      setDraft(null);
      toast.success(t("toasts.saved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.saveFailed"),
      );
    }
  };

  const handleCreate = async () => {
    try {
      await createBackup.mutateAsync();
      toast.success(t("toasts.created"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.createFailed"),
      );
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBackup.mutateAsync(deleteTarget.id);
      toast.success(t("toasts.deleted"));
      setDeleteTarget(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.deleteFailed"),
      );
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await uploadBackup.mutateAsync(file);
      toast.success(t("toasts.uploaded"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.uploadFailed"),
      );
    }
  };

  // After a restore the backend restarts itself. Wait for it to actually go
  // down and come back before navigating, instead of redirecting blind into
  // a dead (or not-yet-restarted) server.
  const waitForRestart = async (): Promise<boolean> => {
    const health = async (): Promise<boolean> => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        return response.ok;
      } catch {
        return false;
      }
    };

    const downDeadline = Date.now() + 60_000;
    while (Date.now() < downDeadline) {
      if (!(await health())) break;
      await sleep(1000);
    }

    const upDeadline = Date.now() + 5 * 60_000;
    while (Date.now() < upDeadline) {
      if (await health()) return true;
      await sleep(2000);
    }
    return false;
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreBackup.mutateAsync(restoreTarget.id);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("toasts.restoreFailed"),
      );
      return;
    }

    setRestoreTarget(null);
    setRestarting(true);
    toast.loading(t("toasts.restoring"), {
      id: "backup-restart",
      duration: Infinity,
    });
    if (await waitForRestart()) {
      window.location.assign("/home");
    } else {
      toast.error(t("toasts.restartTimeout"), {
        id: "backup-restart",
        duration: 15000,
      });
      setRestarting(false);
    }
  };

  if (overview.isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (overview.error || !config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("loadError")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.error instanceof Error && overview.error.message && (
            <p className="text-sm text-destructive">
              {overview.error.message}
            </p>
          )}
          <Button variant="outline" onClick={() => overview.refetch()}>
            {t("retry")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const busy =
    config.isRunning ||
    updateConfig.isPending ||
    createBackup.isPending ||
    uploadBackup.isPending ||
    deleteBackup.isPending ||
    restoreBackup.isPending ||
    restarting;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("automatic.title")}</CardTitle>
          <CardDescription>{t("automatic.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-1">
              <Label htmlFor="automatic-backups">
                {t("automatic.enabled")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("automatic.enabledDescription")}
              </p>
            </div>
            <Switch
              id="automatic-backups"
              checked={form.enabled}
              onCheckedChange={(enabled) => updateDraft({ enabled })}
              disabled={updateConfig.isPending}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="backup-path">{t("automatic.location")}</Label>
              <Input
                id="backup-path"
                value={form.path}
                onChange={(event) => updateDraft({ path: event.target.value })}
                disabled={config.pathLocked || updateConfig.isPending}
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                {config.pathLocked
                  ? t("automatic.locationLocked")
                  : t("automatic.locationHint")}
              </p>
              {config.pathError && (
                <p className="text-sm text-destructive">
                  {t("automatic.pathInvalid")} {config.pathError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t("automatic.frequency")}</Label>
              <Select
                value={form.schedule.frequency}
                onValueChange={(value) =>
                  updateSchedule({ frequency: value as Frequency })
                }
                disabled={!form.enabled || updateConfig.isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("frequency.daily")}</SelectItem>
                  <SelectItem value="weekly">
                    {t("frequency.weekly")}
                  </SelectItem>
                  <SelectItem value="monthly">
                    {t("frequency.monthly")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="backup-time">{t("automatic.time")}</Label>
              <Input
                id="backup-time"
                type="time"
                value={form.schedule.time}
                onChange={(event) =>
                  updateSchedule({ time: event.target.value })
                }
                disabled={!form.enabled || updateConfig.isPending}
              />
            </div>

            {form.schedule.frequency === "weekly" && (
              <div className="space-y-2">
                <Label>{t("automatic.weekday")}</Label>
                <Select
                  value={form.schedule.weekday}
                  onValueChange={(weekday) => updateSchedule({ weekday })}
                  disabled={!form.enabled || updateConfig.isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((day) => (
                      <SelectItem key={day} value={day}>
                        {t(`weekdays.${day}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {form.schedule.frequency === "monthly" && (
              <div className="space-y-2">
                <Label htmlFor="backup-month-day">
                  {t("automatic.monthDay")}
                </Label>
                <Input
                  id="backup-month-day"
                  type="number"
                  min={1}
                  max={28}
                  value={form.schedule.monthDay}
                  onChange={(event) =>
                    updateSchedule({ monthDay: event.target.value })
                  }
                  disabled={!form.enabled || updateConfig.isPending}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="backup-retention">
                {t("automatic.retention")}
              </Label>
              <Input
                id="backup-retention"
                type="number"
                min={1}
                max={99}
                value={form.retention}
                onChange={(event) =>
                  updateDraft({ retention: event.target.value })
                }
                disabled={updateConfig.isPending}
              />
              <p className="text-xs text-muted-foreground">
                {t("automatic.retentionHint")}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {form.enabled && nextBackup
                ? t("automatic.nextBackup", {
                    date: nextBackup.date,
                    timezone: nextBackup.timezone,
                  })
                : t("automatic.noNextBackup")}
            </p>
            <Button onClick={handleSave} disabled={busy}>
              {updateConfig.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {updateConfig.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{t("archives.title")}</CardTitle>
            <CardDescription>{t("archives.description")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={uploadInputRef}
              type="file"
              accept=".bookmark"
              className="sr-only"
              onChange={(event) => {
                void handleUpload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => uploadInputRef.current?.click()}
              disabled={busy}
            >
              {uploadBackup.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploadBackup.isPending
                ? t("archives.uploading")
                : t("archives.upload")}
            </Button>
            <Button onClick={handleCreate} disabled={busy}>
              {createBackup.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Archive className="mr-2 h-4 w-4" />
              )}
              {createBackup.isPending
                ? t("archives.creating")
                : t("archives.create")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="rounded-full bg-muted p-3">
                <HardDriveDownload className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">{t("archives.empty")}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("archives.emptyDescription")}
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y rounded-md border">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                >
                  <Archive className="hidden h-5 w-5 text-muted-foreground sm:block" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{backup.filename}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(backup.createdAt).toLocaleString()} ·{" "}
                      {formatFileSize(backup.size)} · v{backup.appVersion}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={`/api/admin/backups/${encodeURIComponent(backup.id)}/download`}
                        aria-label={t("archives.download", {
                          name: backup.filename,
                        })}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRestoreTarget(backup)}
                      disabled={busy}
                      aria-label={t("archives.restore", {
                        name: backup.filename,
                      })}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(backup)}
                      disabled={busy || deleteBackup.isPending}
                      aria-label={t("archives.delete", {
                        name: backup.filename,
                      })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description", {
                name: deleteTarget?.filename ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Keep the dialog open while the request runs; it closes on
                // success and stays up (with the error toast) on failure.
                event.preventDefault();
                void handleDelete();
              }}
              disabled={deleteBackup.isPending}
            >
              {deleteBackup.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("deleteDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(restoreTarget)}
        onOpenChange={(open) => !open && setRestoreTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("restoreDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("restoreDialog.description", {
                name: restoreTarget?.filename ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // Radix closes the dialog on Action click by default, which
                // would make the "Restoring..." state unreachable.
                event.preventDefault();
                void handleRestore();
              }}
              disabled={restoreBackup.isPending}
            >
              {restoreBackup.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {restoreBackup.isPending
                ? t("restoreDialog.restoring")
                : t("restoreDialog.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
