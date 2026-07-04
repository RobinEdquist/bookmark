"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Headphones, Sparkles, Loader2, Volume2, X } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/ui/alert-dialog";

import { useMyPermissions } from "../../lib/use-users";
import { useTasksStatus } from "../../lib/use-tasks";
import {
  useTtsStatus,
  useTtsJobs,
  useTtsVoices,
  useGenerateAudiobook,
  useCancelTtsJob,
  previewTtsVoice,
} from "../../lib/use-tts";

interface GenerateAudiobookButtonProps {
  ebookId: string;
  format: string;
  /** The generated audiobook, if one already exists for this ebook. */
  generatedAudiobook: { id: string; title: string } | null;
}

export function GenerateAudiobookButton({
  ebookId,
  format,
  generatedAudiobook,
}: GenerateAudiobookButtonProps) {
  const t = useTranslations("ebooks.tts");
  const { data: permissions } = useMyPermissions();
  const isAdmin = permissions?.isAdmin ?? false;
  const canGenerate = isAdmin || (permissions?.canGenerateAudiobooks ?? false);

  // Status/voices are open to admins and generate-permission holders alike.
  const { status, isEnabled, isConfigured } = useTtsStatus(canGenerate);
  const { tts } = useTasksStatus();
  // The jobs list endpoint is admin-only; only fetch it for admins so we can
  // spot a pending (not-yet-active) job for this ebook. Non-admins rely on the
  // tasks websocket payload plus the optimistic in-progress state.
  const { data: jobs } = useTtsJobs(isAdmin);
  const { generate, isGenerating } = useGenerateAudiobook();
  const { cancelJob, isCancelling } = useCancelTtsJob();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [voice, setVoice] = useState("");
  // Only fetch the voice list while the dialog is open
  const { voices } = useTtsVoices(canGenerate && isConfigured && confirmOpen);

  // Default the picker to the globally configured voice
  useEffect(() => {
    if (confirmOpen && !voice && status?.voice) {
      setVoice(status.voice);
    }
  }, [confirmOpen, voice, status?.voice]);

  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const handlePreview = async () => {
    setIsPreviewing(true);
    try {
      const blob = await previewTtsVoice(voice || undefined);
      const url = URL.createObjectURL(blob);
      previewAudioRef.current?.pause();
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("toast.previewFailed"),
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  // Stop a playing preview when the dialog closes
  useEffect(() => {
    if (!confirmOpen) {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    }
  }, [confirmOpen]);

  // Live "active" job wins; otherwise look for a queued/in-flight job for this
  // ebook in the jobs list (a pending job isn't in the tasks `active` slot).
  const activeForThisEbook =
    tts.active?.ebookId === ebookId ? tts.active : null;
  const pendingJob = jobs?.find(
    (j) =>
      j.ebookId === ebookId &&
      (j.status === "pending" ||
        j.status === "extracting" ||
        j.status === "generating" ||
        j.status === "assembling" ||
        j.status === "importing"),
  );
  const inProgress = !!activeForThisEbook || !!pendingJob;

  // 1. Already generated → Listen (visible to everyone).
  if (generatedAudiobook) {
    return (
      <Button asChild size="lg" variant="outline" className="w-full">
        <Link href={`/audiobooks/${generatedAudiobook.id}`}>
          <Headphones className="mr-2 h-5 w-5" />
          {t("listen")}
        </Link>
      </Button>
    );
  }

  // Everything below requires the generate permission and a usable TTS setup.
  if (!canGenerate || !isEnabled || !isConfigured) {
    return null;
  }

  // 2. A job is running (or queued) for this ebook → disabled progress button.
  if (inProgress) {
    const jobId = activeForThisEbook?.jobId ?? pendingJob?.id ?? null;

    let progressLabel: string;
    if (activeForThisEbook?.phase === "generating") {
      const total = activeForThisEbook.totalChapters;
      progressLabel =
        total !== null
          ? t("progress.chapter", {
              completed: activeForThisEbook.completedChapters,
              total,
            })
          : t("progress.generating");
    } else if (activeForThisEbook) {
      progressLabel = t(`progress.phase.${activeForThisEbook.phase}`);
    } else {
      progressLabel = t("progress.queued");
    }

    return (
      <div className="flex w-full items-center gap-2">
        <Button size="lg" variant="outline" className="w-full" disabled>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          {progressLabel}
        </Button>
        {jobId && (
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 shrink-0"
            title={t("cancel")}
            disabled={isCancelling}
            onClick={async () => {
              try {
                await cancelJob(jobId);
                toast.success(t("toast.cancelled"));
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : t("toast.cancelFailed"),
                );
              }
            }}
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </div>
    );
  }

  // Generation only supports EPUB source files.
  if (format.toLowerCase() !== "epub") {
    return null;
  }

  // 3. Offer generation.
  const handleGenerate = async () => {
    try {
      await generate({ ebookId, voice: voice || undefined });
      toast.success(t("toast.started"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toast.startFailed"));
    } finally {
      setConfirmOpen(false);
    }
  };

  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogTrigger asChild>
        <Button size="lg" variant="outline" className="w-full">
          <Sparkles className="mr-2 h-5 w-5" />
          {t("generate")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("confirm.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("confirm.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="generate-voice">{t("confirm.voiceLabel")}</Label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {voices ? (
                <Select value={voice} onValueChange={setVoice}>
                  <SelectTrigger id="generate-voice">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {voices.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                    {voice && !voices.includes(voice) && (
                      <SelectItem value={voice}>{voice}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="generate-voice"
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                />
              )}
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="shrink-0"
              title={t("confirm.preview")}
              disabled={isPreviewing}
              onClick={handlePreview}
            >
              {isPreviewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
              <span className="sr-only">{t("confirm.preview")}</span>
            </Button>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isGenerating}>
            {t("confirm.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleGenerate();
            }}
            disabled={isGenerating}
          >
            {isGenerating ? t("confirm.starting") : t("confirm.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
