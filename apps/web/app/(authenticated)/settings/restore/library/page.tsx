"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Library, BookOpen } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/ui/radio-group";
import { useRestoreSession, useSelectLibrary } from "../../../../../lib/use-restore";
import type { AvailableLibrary } from "../../../../../lib/types/restore";

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("settings.restore");
  const sessionId = searchParams.get("session");

  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");

  const { data: session, isLoading, error } = useRestoreSession(sessionId);
  const selectLibrary = useSelectLibrary();

  // Get available libraries from session
  const availableLibraries: AvailableLibrary[] =
    session?.extractedPath && (session as any).availableLibraries
      ? (session as any).availableLibraries
      : [];

  // Redirect if no session ID
  useEffect(() => {
    if (!sessionId) {
      toast.error(t("library.errors.noSession"));
      router.push("/settings/restore/upload");
    }
  }, [sessionId, router, t]);

  // Pre-select library if already selected in session
  useEffect(() => {
    if (session?.selectedLibraryId && !selectedLibraryId) {
      setSelectedLibraryId(session.selectedLibraryId);
    }
  }, [session?.selectedLibraryId, selectedLibraryId]);

  const handleNext = async () => {
    if (!sessionId || !selectedLibraryId) return;

    try {
      await selectLibrary.mutateAsync({ sessionId, libraryId: selectedLibraryId });
      toast.success(t("library.success"));
      router.push(`/settings/restore/paths?session=${sessionId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("library.errors.selectFailed")
      );
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
            {t("library.errors.loadFailed")}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/settings/restore/upload")}
            className="mt-4"
          >
            {t("library.startOver")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (availableLibraries.length === 0) {
    return (
      <Card className="border-destructive">
        <CardContent className="p-6 space-y-4">
          <p className="text-destructive font-medium">
            {t("library.errors.noLibraries")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("library.errors.noLibrariesDescription")}
          </p>
          <Button
            variant="outline"
            onClick={() => router.push("/settings/restore/upload")}
          >
            {t("library.startOver")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("library.title")}</CardTitle>
        <CardDescription>{t("library.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Library Selection */}
        <div className="space-y-4">
          <Label className="text-base font-medium">
            {t("library.selectLabel")}
          </Label>
          <RadioGroup
            value={selectedLibraryId}
            onValueChange={setSelectedLibraryId}
            className="space-y-3"
          >
            {availableLibraries.map((library) => (
              <div
                key={library.id}
                className={`relative rounded-lg border-2 transition-colors ${
                  selectedLibraryId === library.id
                    ? "border-primary bg-primary/5"
                    : "border-muted hover:border-primary/50"
                }`}
              >
                <label
                  htmlFor={library.id}
                  className="flex items-start gap-4 p-4 cursor-pointer"
                >
                  <RadioGroupItem
                    value={library.id}
                    id={library.id}
                    className="mt-1"
                  />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Library className="h-5 w-5 text-primary" />
                      <span className="font-medium text-lg">{library.name}</span>
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        <span>{t("library.folders", { count: library.folders.length })}</span>
                      </div>
                      <div className="ml-6 space-y-1">
                        {library.folders.map((folder, index) => (
                          <div key={index} className="font-mono text-xs">
                            {folder}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Info Banner */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <p className="text-sm font-medium">
            {t("library.infoTitle")}
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>{t("library.infoPoint1")}</li>
            <li>{t("library.infoPoint2")}</li>
            <li>{t("library.infoPoint3")}</li>
          </ul>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => router.push("/settings/restore/upload")}
            disabled={selectLibrary.isPending}
          >
            {t("library.back")}
          </Button>
          <Button
            onClick={handleNext}
            disabled={!selectedLibraryId || selectLibrary.isPending}
            size="lg"
          >
            {selectLibrary.isPending ? (
              <>
                <LoadingSpinner size="sm" className="mr-2" />
                {t("library.selecting")}
              </>
            ) : (
              t("library.nextButton")
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
