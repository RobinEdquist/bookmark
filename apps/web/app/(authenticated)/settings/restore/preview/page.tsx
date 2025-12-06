"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  BookOpen,
  Users,
  Layers,
  Tags,
  FileText,
  Clock,
  Image,
  UserCircle,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Info,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@repo/ui/components/ui/accordion";
import {
  useRestoreSession,
  useGeneratePreview,
  useExecuteImport,
} from "../../../../../lib/use-restore";

export default function RestorePreviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const { data: session, isLoading: sessionLoading } = useRestoreSession(sessionId);
  const { data: preview, isLoading: previewLoading } = useGeneratePreview(sessionId, true);
  const executeImport = useExecuteImport();

  const handleStartImport = async () => {
    if (!sessionId) {
      toast.error("No session ID found");
      return;
    }

    try {
      await executeImport.mutateAsync(sessionId);
      router.push(`/settings/restore/import?session=${sessionId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to start import"
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

  if (sessionLoading || previewLoading) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center p-12 space-y-4">
          <LoadingSpinner className="h-8 w-8" />
          <p className="text-muted-foreground">Generating preview...</p>
        </CardContent>
      </Card>
    );
  }

  if (!session || !preview) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">Failed to load preview</p>
        </CardContent>
      </Card>
    );
  }

  const hasWarnings = preview.warnings.length > 0;
  const options = session.options;

  // Build the "What will be imported" list
  const willBeImported = [
    {
      icon: BookOpen,
      label: "Audiobooks",
      count: preview.audiobooksToImport.count,
      description: "Audiobook metadata (title, author, description, duration, etc.)",
      always: true,
    },
    {
      icon: Users,
      label: "Authors",
      count: preview.authorsToImport,
      description: "Author information linked to audiobooks",
      always: true,
    },
    {
      icon: Users,
      label: "Narrators",
      count: preview.narratorsToImport,
      description: "Narrator information linked to audiobooks",
      always: true,
    },
    {
      icon: Layers,
      label: "Series",
      count: preview.seriesToImport,
      description: "Series information and audiobook ordering",
      always: true,
    },
    {
      icon: Tags,
      label: "Genres",
      count: preview.genresToImport,
      description: "Genre tags for audiobooks",
      always: true,
    },
    {
      icon: FileText,
      label: "Chapters",
      count: preview.chaptersToImport,
      description: "Chapter markers and titles",
      always: true,
    },
    {
      icon: Clock,
      label: "Listening Progress",
      count: preview.progressRecordsToImport,
      description: "Playback positions, finished status, and bookmarks for mapped users",
      enabled: options?.importProgress,
      skippedReason: !options?.importProgress ? "Disabled in options" :
        preview.usersToMap.skipped > 0 ? `${preview.usersToMap.skipped} user(s) not mapped` : undefined,
    },
    {
      icon: Image,
      label: "Audiobook Covers",
      count: preview.coversToImport,
      description: "Cover images for audiobooks",
      enabled: options?.importCovers,
      skippedReason: !options?.importCovers ? "Disabled in options" : undefined,
    },
    {
      icon: UserCircle,
      label: "Author/Narrator Images",
      count: preview.authorImagesToImport,
      description: "Profile images for authors and narrators",
      enabled: options?.importAuthorImages,
      skippedReason: !options?.importAuthorImages ? "Disabled in options" : undefined,
    },
  ];

  // Build the "What will NOT be imported" list
  const willNotBeImported = [
    {
      label: "User accounts",
      reason: "Users must already exist in SAV. Only progress data is imported for mapped users.",
    },
    {
      label: "Audio files",
      reason: "Audio files are not stored in the backup. SAV reads files directly from your configured library path.",
    },
    {
      label: "Playlists and collections",
      reason: "AudioBookShelf playlists are not supported in SAV.",
    },
    {
      label: "Podcast data",
      reason: "SAV does not support podcasts.",
    },
    {
      label: "Custom metadata fields",
      reason: "AudioBookShelf custom fields are not imported.",
    },
    {
      label: "Library settings",
      reason: "Library configuration must be set up separately in SAV.",
    },
  ];

  // Additional context items
  const importNotes = [
    options?.overwriteExisting
      ? "Existing audiobooks will be OVERWRITTEN with data from the backup."
      : "Existing audiobooks will be SKIPPED (not overwritten).",
    preview.audiobooksToSkip.count > 0
      ? `${preview.audiobooksToSkip.count} audiobook(s) will be skipped because audio files were not found at the expected paths.`
      : null,
    preview.usersToMap.skipped > 0 && options?.importProgress
      ? `Progress for ${preview.usersToMap.skipped} unmapped user(s) will not be imported.`
      : null,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {/* What WILL be imported */}
      <Card className="border-green-500/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <CardTitle>What Will Be Imported</CardTitle>
          </div>
          <CardDescription>
            The following data will be imported from your AudioBookShelf backup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {willBeImported.map((item) => {
              const isEnabled = item.always || item.enabled;
              const showCount = isEnabled && item.count > 0;

              return (
                <div
                  key={item.label}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    isEnabled ? "bg-green-500/5 border-green-500/30" : "bg-muted/50 border-muted"
                  }`}
                >
                  <item.icon className={`h-5 w-5 shrink-0 mt-0.5 ${
                    isEnabled ? "text-green-500" : "text-muted-foreground"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${!isEnabled && "text-muted-foreground"}`}>
                        {item.label}
                      </p>
                      {showCount && (
                        <span className="inline-flex items-center rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                          {item.count.toLocaleString()}
                        </span>
                      )}
                      {!isEnabled && (
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Skipped
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {item.description}
                    </p>
                    {item.skippedReason && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Note: {item.skippedReason}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* What will NOT be imported */}
      <Card className="border-muted">
        <CardHeader>
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-muted-foreground">What Will NOT Be Imported</CardTitle>
          </div>
          <CardDescription>
            The following data from AudioBookShelf is not supported or not included in the import.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {willNotBeImported.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-3 rounded-lg border border-muted bg-muted/30 p-3"
              >
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-muted-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground/80 mt-0.5">
                    {item.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Important Notes */}
      {importNotes.length > 0 && (
        <Card className="border-blue-500/50 bg-blue-500/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-blue-500" />
              <CardTitle className="text-blue-700 dark:text-blue-400">Important Notes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {importNotes.map((note, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span className="flex-1">{note}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <Card className="border-warning bg-warning/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <CardTitle className="text-warning-foreground">
                Warnings
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {preview.warnings.map((warning, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-warning mt-0.5">•</span>
                  <span className="flex-1">{warning}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Sample Audiobooks Accordion */}
      {(preview.audiobooksToImport.sample.length > 0 ||
        preview.audiobooksToSkip.sample.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Sample Audiobooks</CardTitle>
            <CardDescription>
              Review a sample of audiobooks that will be imported or skipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {preview.audiobooksToImport.sample.length > 0 && (
                <AccordionItem value="sample-import">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      Audiobooks to Import ({preview.audiobooksToImport.count.toLocaleString()} total, showing {Math.min(preview.audiobooksToImport.sample.length, 10)})
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {preview.audiobooksToImport.sample
                        .slice(0, 10)
                        .map((book, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 rounded-md border border-green-500/30 bg-green-500/5 p-3 text-sm"
                          >
                            <ChevronRight className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{book.title}</p>
                              <p className="text-muted-foreground">
                                by {book.author}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1 font-mono">
                                {book.savPath}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {preview.audiobooksToSkip.sample.length > 0 && (
                <AccordionItem value="sample-skip">
                  <AccordionTrigger>
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Audiobooks to Skip ({preview.audiobooksToSkip.count.toLocaleString()} total, showing {Math.min(preview.audiobooksToSkip.sample.length, 10)})
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {preview.audiobooksToSkip.sample
                        .slice(0, 10)
                        .map((book, index) => (
                          <div
                            key={index}
                            className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/5 p-3 text-sm"
                          >
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{book.title}</p>
                              <p className="text-muted-foreground">
                                by {book.author}
                              </p>
                              {book.reason && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                  Reason: {book.reason}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1 font-mono">
                                Expected: {book.savPath}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleStartImport}
          disabled={executeImport.isPending}
          size="lg"
        >
          {executeImport.isPending ? (
            <>
              <LoadingSpinner className="mr-2 h-4 w-4" />
              Starting...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Start Import
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
