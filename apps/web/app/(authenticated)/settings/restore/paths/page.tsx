"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Folder, ArrowRight } from "lucide-react";
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
import { useRestoreSession, useSetPathMappings } from "../../../../../lib/use-restore";
import type { PathMapping } from "../../../../../lib/types/restore";

export default function PathsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settings.restore");
  const sessionId = searchParams.get("session");

  const [savPath, setSavPath] = useState<string>("");

  const { data: session, isLoading, error } = useRestoreSession(sessionId);
  const setPathMappings = useSetPathMappings();

  // Get the ABS library path from session
  const absPath = session?.pathMappings?.[0]?.absPath || "";

  // Redirect if no session ID
  useEffect(() => {
    if (!sessionId) {
      toast.error(t("paths.errors.noSession"));
      router.push("/settings/restore/upload");
    }
  }, [sessionId, router, t]);

  // Pre-fill SAV path if already set in session
  useEffect(() => {
    if (session?.pathMappings?.[0]?.savPath && !savPath) {
      setSavPath(session.pathMappings[0].savPath);
    }
  }, [session?.pathMappings, savPath]);

  const handleNext = async () => {
    if (!sessionId || !savPath) return;

    const pathMapping: PathMapping = {
      absPath: absPath,
      savPath: savPath.trim(),
    };

    try {
      await setPathMappings.mutateAsync({
        sessionId,
        pathMappings: [pathMapping],
      });
      toast.success(t("paths.success"));
      router.push(`/settings/restore/users?session=${sessionId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("paths.errors.saveFailed")
      );
    }
  };

  const handleBack = () => {
    if (sessionId) {
      router.push(`/settings/restore/library?session=${sessionId}`);
    } else {
      router.push("/settings/restore/upload");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <LoadingSpinner size="lg" className="text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (error || !session) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6">
          <p className="text-destructive">
            {t("paths.errors.loadFailed")}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/settings/restore/upload")}
            className="mt-4"
          >
            {t("paths.startOver")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!absPath) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 space-y-4">
          <p className="text-destructive font-medium">
            {t("paths.errors.noLibrarySelected")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("paths.errors.noLibrarySelectedDescription")}
          </p>
          <Button
            variant="outline"
            onClick={handleBack}
          >
            {t("paths.back")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("paths.title")}</CardTitle>
        <CardDescription>{t("paths.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Path Mapping */}
        <div className="space-y-4">
          {/* ABS Path (Read-only) */}
          <div className="space-y-2">
            <Label htmlFor="abs-path" className="text-base font-medium">
              {t("paths.absPathLabel")}
            </Label>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
              <Folder className="h-5 w-5 text-muted-foreground" />
              <code className="text-sm font-mono flex-1">{absPath}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("paths.absPathDescription")}
            </p>
          </div>

          {/* Arrow Indicator */}
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-px w-12 bg-border" />
              <ArrowRight className="h-5 w-5" />
              <div className="h-px w-12 bg-border" />
            </div>
          </div>

          {/* SAV Path (Input) */}
          <div className="space-y-2">
            <Label htmlFor="sav-path" className="text-base font-medium">
              {t("paths.savPathLabel")}
            </Label>
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-muted-foreground" />
              <Input
                id="sav-path"
                type="text"
                value={savPath}
                onChange={(e) => setSavPath(e.target.value)}
                placeholder="/media/audiobooks"
                className="flex-1 font-mono"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {t("paths.savPathDescription")}
            </p>
          </div>
        </div>

        {/* TODO: Validation Results will be added when backend is ready */}

        {/* Info Banner */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <p className="text-sm font-medium">
            {t("paths.infoTitle")}
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t("paths.infoPoint1")}</li>
            <li>{t("paths.infoPoint2")}</li>
            <li>{t("paths.infoPoint3")}</li>
          </ul>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={setPathMappings.isPending}
          >
            {t("paths.back")}
          </Button>
          <Button
            onClick={handleNext}
            disabled={!savPath.trim() || setPathMappings.isPending}
            size="lg"
          >
            {setPathMappings.isPending ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                {t("paths.saving")}
              </>
            ) : (
              t("paths.nextButton")
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
