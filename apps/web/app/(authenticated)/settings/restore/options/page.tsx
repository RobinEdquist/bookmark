"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

  const { data: session, isLoading: sessionLoading } = useRestoreSession(sessionId);
  const setRestoreOptions = useSetRestoreOptions();

  // Local state for options
  const [options, setOptions] = useState<RestoreOptions>({
    importProgress: true,
    importCovers: true,
    importAuthorImages: true,
    overwriteExisting: false,
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
      toast.error("No session ID found");
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
        error instanceof Error ? error.message : "Failed to save restore options"
      );
    }
  };

  if (!sessionId) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">No session ID found</p>
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
          <p className="text-muted-foreground">Failed to load session</p>
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
            <CardTitle>Import Options</CardTitle>
          </div>
          <CardDescription>
            Choose what data to import from your AudioBookShelf backup.
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
                Import listening progress
              </Label>
              <p className="text-sm text-muted-foreground">
                Import user playback positions and completion status for mapped
                users. This includes current position, finished books, and
                bookmarks.
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
                Import audiobook covers
              </Label>
              <p className="text-sm text-muted-foreground">
                Copy cover images from the AudioBookShelf backup to your Simple
                Audiobook Vault library. Covers will be stored in the app data
                folder.
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
                Import author images
              </Label>
              <p className="text-sm text-muted-foreground">
                Copy author and narrator profile images from the AudioBookShelf
                backup. These will be stored in the app data folder.
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
                  Overwrite existing audiobooks
                </Label>
                <p className="text-sm text-muted-foreground">
                  Replace metadata for audiobooks that already exist in your
                  library (matched by file path). This will overwrite titles,
                  descriptions, covers, and other metadata.
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
                Data will be overwritten
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Existing audiobook metadata and covers will be replaced with
                data from the AudioBookShelf backup. This action cannot be
                undone. Make sure you have a backup of your current data if
                needed.
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
              Saving...
            </>
          ) : (
            <>
              Next: Preview
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
