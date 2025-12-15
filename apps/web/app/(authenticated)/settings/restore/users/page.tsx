"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
  useBookmarkUsers,
  useSetUserMappings,
} from "../../../../../lib/use-restore";
import type { UserMapping } from "../../../../../lib/types/restore";

export default function RestoreUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const t = useTranslations("settings.restore.users");

  const { data: session, isLoading: sessionLoading } = useRestoreSession(sessionId);
  const { data: savUsers, isLoading: usersLoading } = useBookmarkUsers();
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
      toast.error(t("errors.noSession"));
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
          <p className="text-muted-foreground">{t("errors.loadFailed")}</p>
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
            <CardTitle>{t("title")}</CardTitle>
          </div>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {userMappings.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-muted-foreground">
                {t("noUsersFound")}
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
                          {t("progressInfo", { count: mapping.progressCount })}
                        </span>
                        <span>
                          {t("inProgressInfo", { count: mapping.inProgressCount })}
                        </span>
                        <span>
                          {t("finishedInfo", { count: mapping.finishedCount })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`mapping-${mapping.absUserId}`}>
                      {t("savUserLabel")}
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
                        <SelectValue placeholder={t("skipUser")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">
                          <span className="text-muted-foreground">
                            {t("skipUser")}
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
                        {t("skipWarning")}
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
              {t("unmappedWarning")}
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
