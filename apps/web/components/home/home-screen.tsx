"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Skeleton } from "@repo/ui/components/ui/skeleton";
import { useLibraryAvailability } from "../../lib/use-library-availability";
import { useMyPermissions } from "../../lib/use-users";
import { useOnboardingDismissed } from "../../lib/use-onboarding-dismissed";
import {
  LibrarySetupOnboarding,
  WaitingForSetup,
} from "./library-setup-onboarding";
import { AnnouncementBanner } from "./announcement-banner";
import { ContinueListeningSection } from "./continue-listening-section";
import { ContinueReadingSection } from "./continue-reading-section";
import { RecentlyUpdatedListsSection } from "./recently-updated-lists-section";
import { RecentlyAddedSection } from "./recently-added-section";
import { RecentlyAddedEbooksSection } from "./recently-added-ebooks-section";
import { RecentlyAddedComicsSection } from "./recently-added-comics-section";
import { RecentlyUpdatedSeriesSection } from "./recently-updated-series-section";

function HomeLoading() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        {[...Array(2)].map((_, section) => (
          <div key={section} className="space-y-4">
            <Skeleton className="h-7 w-48" />
            <div className="flex gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="w-40 shrink-0">
                  <Skeleton className="aspect-square rounded-xl" />
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResumeSetupBanner({ onResume }: { onResume: () => void }) {
  const t = useTranslations("home.onboarding.resume");

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">{t("title")}</h3>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>
      <Button onClick={onResume} className="shrink-0 sm:self-center">
        {t("action")}
        <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
}

function HomeFeed({ resumeSetup }: { resumeSetup?: () => void }) {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <AnnouncementBanner />
        {resumeSetup ? (
          <ResumeSetupBanner onResume={resumeSetup} />
        ) : (
          <>
            <ContinueListeningSection />
            <ContinueReadingSection />
            <RecentlyAddedSection />
            <RecentlyAddedEbooksSection />
            <RecentlyAddedComicsSection />
            <RecentlyUpdatedListsSection />
            <RecentlyUpdatedSeriesSection />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Decides what the home view shows:
 *   - fresh install (no libraries) + admin  → first-run setup wizard
 *   - fresh install + non-admin              → "being set up" waiting screen
 *   - otherwise                              → the normal home feed
 *
 * The wizard entry decision is latched once (per session) so that configuring a
 * library mid-wizard — which flips `availability` to configured — doesn't yank
 * the wizard out from under the admin before they reach the final step.
 */
export function HomeScreen() {
  const { data: availability, isLoading: availabilityLoading } =
    useLibraryAvailability();
  const { data: permissions, isLoading: permissionsLoading } =
    useMyPermissions();
  const [dismissed, setDismissed] = useOnboardingDismissed();

  // null = undecided (still loading); true/false = latched wizard visibility.
  const [wizardOpen, setWizardOpen] = useState<boolean | null>(null);

  const loading = availabilityLoading || permissionsLoading;
  const isAdmin = permissions?.isAdmin ?? false;
  const configured =
    !!availability &&
    (availability.audiobooks || availability.ebooks || availability.comics);

  useEffect(() => {
    if (wizardOpen === null && !loading && isAdmin && availability) {
      setWizardOpen(!configured && !dismissed);
    }
  }, [wizardOpen, loading, isAdmin, availability, configured, dismissed]);

  if (loading) {
    return <HomeLoading />;
  }

  // Non-admins can't configure anything: show real content once it's available,
  // otherwise a calm "being set up" screen. Never mount the admin wizard here
  // (it reads admin-only settings).
  if (!isAdmin) {
    return configured ? <HomeFeed /> : <WaitingForSetup />;
  }

  // Admin, but the entry decision hasn't resolved for a tick yet.
  if (wizardOpen === null) {
    return <HomeLoading />;
  }

  if (wizardOpen) {
    return (
      <LibrarySetupOnboarding
        onFinish={() => {
          setDismissed(true);
          setWizardOpen(false);
        }}
        onSkip={() => {
          setDismissed(true);
          setWizardOpen(false);
        }}
      />
    );
  }

  // Admin who finished or skipped. If they still have nothing configured, keep a
  // gentle way back into the wizard instead of the emptier per-section prompts.
  return (
    <HomeFeed
      resumeSetup={
        !configured
          ? () => {
              setDismissed(false);
              setWizardOpen(true);
            }
          : undefined
      }
    />
  );
}
