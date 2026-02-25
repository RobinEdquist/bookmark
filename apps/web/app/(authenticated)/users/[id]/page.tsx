"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { LoadingSpinner } from "@repo/ui/components/ui/loading-spinner";

import { useUserStats, useUserActivity } from "../../../../lib/use-user-profile";
import { UserProfileHeader } from "../../../../components/users/user-profile-header";
import { StatCards } from "../../../../components/users/stat-cards";
import { ContributionGraph } from "../../../../components/users/contribution-graph";
import { LibraryProgressList } from "../../../../components/users/library-progress-list";
import { SessionLog } from "../../../../components/users/session-log";

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const t = useTranslations("userProfile");
  const currentYear = new Date().getFullYear();

  const { data: stats, isLoading: isStatsLoading } = useUserStats(id);
  const { data: activity, isLoading: isActivityLoading } = useUserActivity(
    id,
    currentYear,
  );

  if (isStatsLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" className="text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{t("stats.noData")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <UserProfileHeader user={stats.user} />
      <StatCards stats={stats} />
      <ContributionGraph
        days={activity?.days ?? {}}
        isLoading={isActivityLoading}
      />
      <LibraryProgressList userId={id} />
      <SessionLog userId={id} />
    </div>
  );
}
