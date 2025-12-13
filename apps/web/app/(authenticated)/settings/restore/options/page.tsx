"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRight, Settings, AlertTriangle } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useRestoreSession,
  useSetRestoreOptions,
} from "../../../../../lib/use-restore";
import type { RestoreOptions } from "../../../../../lib/types/restore";

export default function RestoreOptionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const t = useTranslations("settings.restore.options");

  const { data: session, isLoading: sessionLoading } = useRestoreSession(sessionId);
  const setRestoreOptions = useSetRestoreOptions();

  // Local state for options
  const [options, setOptions] = useState<RestoreOptions>({
    importProgress: true,
    importCovers: true,
    importAuthorImages: true,
    overwriteExisting: false,
    lockMetadata: false,
  });

  // Initialize options from session
  useEffect(() => {
    if (session?.options) {
      setOptions(session.options);
    }
  }, [session]);

  const handleOptionChange = (key: keyof RestoreOptions, value: boolean) => {
    setOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleNext = async () => {
    if (!sessionId) {
      toast.error(t("errors.noSession"));
      return;
    }

    try {
      await setRestoreOptions.mutateAsync({
        sessionId,
        options,
      });
      router.push(`/settings/restore/preview?session=${sessionId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("errors.saveFailed")
      );
    }
  };

  if (!sessionId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">{t("errors.noSession")}</p>
        </CardContent>
      </Card>
    );
  }

  if (sessionLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <LoadingSpinner className="h-8 w-8" />
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">{t("errors.loadFailed")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            <CardTitle>{t("title")}</CardTitle>
          </div>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="importProgress"
              checked={options.importProgress}
              onCheckedChange={(checked) =>
                handleOptionChange("importProgress", checked === true)
              }
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="importProgress"
                className="cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t("importProgress.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("importProgress.description")}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="importCovers"
              checked={options.importCovers}
              onCheckedChange={(checked) =>
                handleOptionChange("importCovers", checked === true)
              }
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="importCovers"
                className="cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t("importCovers.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("importCovers.description")}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="importAuthorImages"
              checked={options.importAuthorImages}
              onCheckedChange={(checked) =>
                handleOptionChange("importAuthorImages", checked === true)
              }
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="importAuthorImages"
                className="cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t("importAuthorImages.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("importAuthorImages.description")}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="lockMetadata"
              checked={options.lockMetadata}
              onCheckedChange={(checked) =>
                handleOptionChange("lockMetadata", checked === true)
              }
            />
            <div className="flex-1 space-y-1">
              <Label
                htmlFor="lockMetadata"
                className="cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t("lockMetadata.label")}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t("lockMetadata.description")}
              </p>
            </div>
          </div>

          <div className="border-t pt-6">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="overwriteExisting"
                checked={options.overwriteExisting}
                onCheckedChange={(checked) =>
                  handleOptionChange("overwriteExisting", checked === true)
                }
              />
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor="overwriteExisting"
                  className="cursor-pointer font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t("overwriteExisting.label")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("overwriteExisting.description")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {options.overwriteExisting && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-destructive-foreground">
                {t("overwriteExisting.label")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("overwriteWarning")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          disabled={setRestoreOptions.isPending}
          size="lg"
        >
          {setRestoreOptions.isPending ? (
            <>
              <LoadingSpinner className="mr-2 h-4 w-4" />
              {t("saving")}
            </>
          ) : (
            <>
              {t("nextButton")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
