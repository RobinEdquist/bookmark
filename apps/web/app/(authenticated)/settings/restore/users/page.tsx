"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Users } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Label } from "@repo/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";
import {
  useRestoreSession,
  useSavUsers,
  useSetUserMappings,
} from "../../../../../lib/use-restore";
import type { UserMapping } from "../../../../../lib/types/restore";

export default function RestoreUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  const { data: session, isLoading: sessionLoading } = useRestoreSession(sessionId);
  const { data: savUsers, isLoading: usersLoading } = useSavUsers();
  const setUserMappingsMutation = useSetUserMappings();

  // Local state for user mappings
  const [userMappings, setUserMappings] = useState<UserMapping[]>([]);

  // Initialize user mappings from session
  useEffect(() => {
    if (session?.userMappings) {
      setUserMappings(session.userMappings);
    }
  }, [session?.userMappings]);

  const handleMappingChange = (absUserId: string, savUserId: string | null) => {
    setUserMappings((prev) =>
      prev.map((mapping) =>
        mapping.absUserId === absUserId
          ? { ...mapping, savUserId }
          : mapping
      )
    );
  };

  const handleNext = async () => {
    if (!sessionId) {
      toast.error("No session ID found");
      return;
    }

    try {
      await setUserMappingsMutation.mutateAsync({
        sessionId,
        userMappings,
      });
      router.push(`/settings/restore/options?session=${sessionId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save user mappings"
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

  if (sessionLoading || usersLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <LoadingSpinner className="h-8 w-8" />
        </CardContent>
      </Card>
    );
  }

  if (!session || !savUsers) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-12">
          <p className="text-muted-foreground">Failed to load session or users</p>
        </CardContent>
      </Card>
    );
  }

  const hasUnmappedUsers = userMappings.some(
    (mapping) => mapping.savUserId === null && mapping.progressCount > 0
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Map Users</CardTitle>
          </div>
          <CardDescription>
            Map AudioBookShelf users to Simple Audiobook Vault users to import
            listening progress. Users can be skipped if you don&apos;t want to
            import their progress.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userMappings.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">
                No users found in backup with listening progress
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {userMappings.map((mapping) => (
                <div
                  key={mapping.absUserId}
                  className="rounded-lg border p-4 space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium">{mapping.absUsername}</h3>
                      <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
                        <span>
                          {mapping.progressCount} total progress records
                        </span>
                        <span>
                          {mapping.inProgressCount} in progress
                        </span>
                        <span>
                          {mapping.finishedCount} finished
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`mapping-${mapping.absUserId}`}>
                      Map to SAV user
                    </Label>
                    <Select
                      value={mapping.savUserId || "skip"}
                      onValueChange={(value) =>
                        handleMappingChange(
                          mapping.absUserId,
                          value === "skip" ? null : value
                        )
                      }
                    >
                      <SelectTrigger id={`mapping-${mapping.absUserId}`}>
                        <SelectValue placeholder="Select a user or skip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">
                          <span className="text-muted-foreground">
                            Skip this user
                          </span>
                        </SelectItem>
                        {savUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({user.email})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping.savUserId === null && mapping.progressCount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Progress for this user will not be imported
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {hasUnmappedUsers && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="p-4">
            <p className="text-sm text-warning-foreground">
              Some users with progress are not mapped to SAV users. Their
              listening progress will not be imported.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button
          onClick={handleNext}
          disabled={setUserMappingsMutation.isPending}
          size="lg"
        >
          {setUserMappingsMutation.isPending ? (
            <>
              <LoadingSpinner className="mr-2 h-4 w-4" />
              Saving...
            </>
          ) : (
            <>
              Next: Options
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
