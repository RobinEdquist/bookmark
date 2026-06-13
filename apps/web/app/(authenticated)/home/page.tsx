"use client";

import { StatsSection } from "../../../components/home/stats-section";
import { ContinueListeningSection } from "../../../components/home/continue-listening-section";
import { ContinueReadingSection } from "../../../components/home/continue-reading-section";
import { RecentlyUpdatedListsSection } from "../../../components/home/recently-updated-lists-section";
import { RecentlyAddedSection } from "../../../components/home/recently-added-section";
import { RecentlyAddedEbooksSection } from "../../../components/home/recently-added-ebooks-section";
import { RecentlyAddedComicsSection } from "../../../components/home/recently-added-comics-section";
import { RecentlyUpdatedSeriesSection } from "../../../components/home/recently-updated-series-section";
import { AnnouncementBanner } from "../../../components/home/announcement-banner";

export default function HomePage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <AnnouncementBanner />
        <StatsSection />
        <ContinueListeningSection />
        <ContinueReadingSection />
        <RecentlyAddedSection />
        <RecentlyAddedEbooksSection />
        <RecentlyAddedComicsSection />
        <RecentlyUpdatedListsSection />
        <RecentlyUpdatedSeriesSection />
      </div>
    </div>
  );
}
