"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Library,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useRestoreSession,
  useRestoreProgress,
} from "../../../../../lib/use-restore";
import { RestoreSessionState } from "../../../../../lib/types/restore";

export default function RestoreImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const { data: session, isLoading: sessionLoading } = useRestoreSession(sessionId);
  const { progress, isConnected } = useRestoreProgress(sessionId);

  const logContainerRef = useRef<HTMLDivElement>(null);
  const hasNavigated = useRef(false);

  // Auto-scroll to bottom when new logs appear
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [progress]);

  // Navigate to library when completed
  useEffect(() => {
    if (
      session?.state === RestoreSessionState.COMPLETED &&
      !hasNavigated.current
    ) {
      hasNavigated.current = true;
      // Small delay to show the completion message
      setTimeout(() => {
        router.push("/library");
      }, 3000);
    }
  }, [session?.state, router]);

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

  const isImporting = session.state === RestoreSessionState.IMPORTING;
  const isCompleted = session.state === RestoreSessionState.COMPLETED;
  const isFailed = session.state === RestoreSessionState.FAILED;
  const isRolledBack = session.state === RestoreSessionState.ROLLED_BACK;

  const percentage = progress?.percentage || 0;
  const currentOperation = progress?.currentOperation || "Preparing import...";
  const hasErrors = (progress?.errors?.length || 0) > 0;

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            {isImporting && (
              <>
                <Loader2 className="h-5 w-5 text-primary animate-spin" />
                <CardTitle>Importing Data</CardTitle>
              </>
            )}
            {isCompleted && (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <CardTitle>Import Complete</CardTitle>
              </>
            )}
            {(isFailed || isRolledBack) && (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                <CardTitle>Import Failed</CardTitle>
              </>
            )}
          </div>
          {isImporting && (
            <CardDescription>
              Please do not close this page. The import is in progress.
            </CardDescription>
          )}
          {isCompleted && (
            <CardDescription>
              Your AudioBookShelf data has been successfully imported!
            </CardDescription>
          )}
          {(isFailed || isRolledBack) && (
            <CardDescription>
              The import failed and all changes have been rolled back.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{Math.round(percentage)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          {/* Current Operation */}
          <div className="rounded-lg border p-4">
            <p className="text-sm font-medium text-muted-foreground">
              Current Operation
            </p>
            <p className="mt-1 text-sm">{currentOperation}</p>
            {!isConnected && isImporting && (
              <p className="mt-2 flex items-center gap-2 text-xs text-warning">
                <AlertTriangle className="h-3 w-3" />
                Reconnecting to server...
              </p>
            )}
          </div>

          {/* Progress Stats */}
          {session.totalItems > 0 && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Items Processed
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {session.processedItems.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">
                  Total Items
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {session.totalItems.toLocaleString()}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Messages */}
      {hasErrors && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive-foreground">
                Errors
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {progress?.errors.map((error, index) => (
                <div
                  key={index}
                  className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm"
                >
                  {error}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session Error */}
      {session.errorMessage && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <CardTitle className="text-destructive-foreground">
                Import Error
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{session.errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Completion Message */}
      {isCompleted && (
        <Card className="border-green-500 bg-green-500/5">
          <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">Import Complete!</h3>
              <p className="text-muted-foreground">
                Your AudioBookShelf data has been successfully imported.
                Redirecting to your library...
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/library">
                <Library className="mr-2 h-4 w-4" />
                Go to Library
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Rollback Message */}
      {isRolledBack && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
            <AlertTriangle className="h-16 w-16 text-warning" />
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold">Changes Rolled Back</h3>
              <p className="text-muted-foreground">
                The import was cancelled or failed, and all changes have been
                rolled back. No data was modified.
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                asChild
              >
                <Link href="/settings/restore/upload">Try Again</Link>
              </Button>
              <Button asChild>
                <Link href="/settings">Back to Settings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed Message with Retry */}
      {isFailed && (
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/settings/restore/upload`)
            }
          >
            Start Over
          </Button>
          <Button asChild>
            <Link href="/settings">Back to Settings</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
