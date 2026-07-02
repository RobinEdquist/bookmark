"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Headphones,
  BookOpen,
  BookImage,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  FolderOpen,
  Folder,
  X,
  Settings,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@repo/ui/components/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { FolderPickerDialog } from "../settings/folder-picker-dialog";
import { useSettings, type UpdateSettingsDto } from "../../lib/use-settings";

type MediaTypeId = "audiobooks" | "ebooks" | "comics";
type LibraryPathKey =
  | "audiobookLibraryPath"
  | "ebookLibraryPath"
  | "comicLibraryPath";

interface MediaType {
  id: MediaTypeId;
  settingKey: LibraryPathKey;
  icon: LucideIcon;
  defaultPath: string;
}

const MEDIA_TYPES: readonly MediaType[] = [
  {
    id: "audiobooks",
    settingKey: "audiobookLibraryPath",
    icon: Headphones,
    defaultPath: "/library/audiobooks",
  },
  {
    id: "ebooks",
    settingKey: "ebookLibraryPath",
    icon: BookOpen,
    defaultPath: "/library/ebooks",
  },
  {
    id: "comics",
    settingKey: "comicLibraryPath",
    icon: BookImage,
    defaultPath: "/library/comics",
  },
];

type Step = "welcome" | "libraries" | "done";
const STEP_ORDER: Step[] = ["welcome", "libraries", "done"];

/**
 * Ambient glow + grid backdrop, echoing the login screen so first-run feels
 * like a cohesive part of the product rather than a bare form.
 */
function Backdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute -top-24 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/15 blur-[130px]" />
      <div className="absolute bottom-[-8rem] left-[8%] h-[360px] w-[360px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--foreground)/0.03)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const t = useTranslations("home.onboarding");
  const currentIndex = STEP_ORDER.indexOf(current);

  return (
    <ol className="flex items-center justify-center gap-2 sm:gap-3">
      {STEP_ORDER.map((step, index) => {
        const isComplete = index < currentIndex;
        const isActive = index === currentIndex;
        return (
          <li key={step} className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  isActive && "border-primary bg-primary/10 text-primary",
                  !isComplete && !isActive && "border-border text-muted-foreground"
                )}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "hidden text-sm font-medium sm:inline",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {t(`steps.${step}`)}
              </span>
            </div>
            {index < STEP_ORDER.length - 1 && (
              <span
                className={cn(
                  "h-px w-6 sm:w-10 transition-colors",
                  isComplete ? "bg-primary" : "bg-border"
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function MediaTypeCard({
  media,
  path,
  isBusy,
  onChoose,
  onRemove,
}: {
  media: MediaType;
  path: string | null;
  isBusy: boolean;
  onChoose: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("home.onboarding.libraries");
  const Icon = media.icon;
  const configured = !!path;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        configured ? "border-primary/40 bg-primary/[0.06]" : "bg-card"
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
            configured
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{t(`${media.id}Label`)}</h3>
            {configured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                <Check className="h-3 w-3" />
                {t("configured")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t(`${media.id}Description`)}
          </p>
          {configured && (
            <div className="mt-2 flex items-center gap-2">
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-0.5 text-xs">
                {path}
              </code>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {configured ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onChoose}
                disabled={isBusy}
              >
                {t("change")}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground"
                onClick={onRemove}
                disabled={isBusy}
                title={t("remove")}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">{t("remove")}</span>
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={onChoose}
              disabled={isBusy}
            >
              <FolderOpen className="mr-1.5 h-4 w-4" />
              {t("chooseFolder")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface LibrarySetupOnboardingProps {
  /** Called when the admin finishes the wizard and wants to see their library. */
  onFinish: () => void;
  /** Called when the admin skips setup for now. */
  onSkip: () => void;
}

/**
 * First-run setup wizard shown on the home view when no libraries are
 * configured yet. Admin-only — reads/writes app settings, so it must not be
 * rendered for non-admins (use {@link WaitingForSetup} for those).
 */
export function LibrarySetupOnboarding({
  onFinish,
  onSkip,
}: LibrarySetupOnboardingProps) {
  const t = useTranslations("home.onboarding");
  const router = useRouter();
  const { settings, updateSettings, isUpdating } = useSettings();
  const [step, setStep] = useState<Step>("welcome");
  const [pickerFor, setPickerFor] = useState<MediaType | null>(null);

  const pathFor = (media: MediaType) => settings?.[media.settingKey] ?? null;
  const configuredMedia = MEDIA_TYPES.filter((m) => !!pathFor(m));

  const handleSelectPath = async (path: string) => {
    if (!pickerFor) return;
    const update: UpdateSettingsDto = { [pickerFor.settingKey]: path };
    try {
      await updateSettings(update);
      toast.success(t("libraries.toast.saved"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("libraries.toast.error")
      );
    }
  };

  const handleRemovePath = async (media: MediaType) => {
    const update: UpdateSettingsDto = { [media.settingKey]: null };
    try {
      await updateSettings(update);
      toast.success(t("libraries.toast.removed"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("libraries.toast.error")
      );
    }
  };

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-4 sm:p-8">
      <Backdrop />

      <div className="relative z-10 w-full max-w-2xl">
        <div className="mb-8">
          <StepIndicator current={step} />
        </div>

        <div className="rounded-2xl border bg-card/80 p-6 shadow-xl backdrop-blur-sm sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {step === "welcome" && (
                <div className="flex flex-col items-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {t("welcome.title")}
                  </h1>
                  <p className="mt-3 max-w-md text-muted-foreground">
                    {t("welcome.subtitle")}
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                    {MEDIA_TYPES.map((media) => {
                      const Icon = media.icon;
                      return (
                        <span
                          key={media.id}
                          className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1.5 text-sm text-muted-foreground"
                        >
                          <Icon className="h-4 w-4" />
                          {t(`welcome.${media.id}`)}
                        </span>
                      );
                    })}
                  </div>

                  <p className="mt-6 max-w-md text-sm text-muted-foreground">
                    {t("welcome.intro")}
                  </p>

                  <div className="mt-8 flex w-full flex-col-reverse items-center gap-3 sm:flex-row sm:justify-center">
                    <Button variant="ghost" onClick={onSkip}>
                      {t("welcome.skip")}
                    </Button>
                    <Button size="lg" onClick={() => setStep("libraries")}>
                      {t("welcome.getStarted")}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === "libraries" && (
                <div>
                  <div className="mb-6">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {t("libraries.title")}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("libraries.subtitle")}
                    </p>
                  </div>

                  <div className="space-y-3">
                    {MEDIA_TYPES.map((media) => (
                      <MediaTypeCard
                        key={media.id}
                        media={media}
                        path={pathFor(media)}
                        isBusy={isUpdating}
                        onChoose={() => setPickerFor(media)}
                        onRemove={() => handleRemovePath(media)}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{t("libraries.scanHint")}</span>
                  </div>

                  <div className="mt-8 flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setStep("welcome")}>
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      {t("libraries.back")}
                    </Button>
                    <Button size="lg" onClick={() => setStep("done")}>
                      {t("libraries.continue")}
                      <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {step === "done" && (
                <div className="flex flex-col items-center text-center">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <CheckCircle2 className="h-9 w-9" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    {t("done.title")}
                  </h2>
                  <p className="mt-3 max-w-md text-muted-foreground">
                    {configuredMedia.length > 0
                      ? t("done.subtitleScanning")
                      : t("done.subtitleEmpty")}
                  </p>

                  {configuredMedia.length > 0 && (
                    <div className="mt-6 w-full space-y-2 text-left">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t("done.configuredTitle")}
                      </p>
                      {configuredMedia.map((media) => {
                        const Icon = media.icon;
                        return (
                          <div
                            key={media.id}
                            className="flex items-center gap-3 rounded-lg border bg-background/60 p-3"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                              <Icon className="h-4 w-4" />
                            </div>
                            <span className="shrink-0 text-sm font-medium">
                              {t(`libraries.${media.id}Label`)}
                            </span>
                            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-0.5 text-right text-xs text-muted-foreground">
                              {pathFor(media)}
                            </code>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-8 flex w-full flex-col-reverse items-center gap-3 sm:flex-row sm:justify-center">
                    <Button
                      variant="outline"
                      onClick={() => router.push("/settings")}
                    >
                      <Settings className="mr-1.5 h-4 w-4" />
                      {t("done.openSettings")}
                    </Button>
                    <Button size="lg" onClick={onFinish}>
                      {t("done.goToLibrary")}
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <FolderPickerDialog
        open={pickerFor !== null}
        onOpenChange={(open) => {
          if (!open) setPickerFor(null);
        }}
        onSelect={handleSelectPath}
        initialPath={
          (pickerFor && pathFor(pickerFor)) ||
          pickerFor?.defaultPath ||
          "/library"
        }
        title={pickerFor ? t(`libraries.${pickerFor.id}Label`) : undefined}
        description={
          pickerFor ? t(`libraries.${pickerFor.id}Description`) : undefined
        }
      />
    </div>
  );
}

/**
 * Shown to non-admins on the home view before any library is configured. They
 * can't set anything up themselves, so this is a calm "check back soon" state.
 */
export function WaitingForSetup() {
  const t = useTranslations("home.onboarding.waiting");

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden p-4 sm:p-8">
      <Backdrop />
      <motion.div
        className="relative z-10 flex max-w-md flex-col items-center rounded-2xl border bg-card/80 p-8 text-center shadow-xl backdrop-blur-sm"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <Clock className="h-8 w-8" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {t("title")}
        </h1>
        <p className="mt-3 text-muted-foreground">{t("description")}</p>
      </motion.div>
    </div>
  );
}
