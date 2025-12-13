"use client";

import { StatsSection } from "../../../components/home/stats-section";
import { ContinueListeningSection } from "../../../components/home/continue-listening-section";
import { RecentlyAddedSection } from "../../../components/home/recently-added-section";
import { RecentlyAddedEbooksSection } from "../../../components/home/recently-added-ebooks-section";
import { RecentlyUpdatedSeriesSection } from "../../../components/home/recently-updated-series-section";

export default function HomePage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <StatsSection />
        <ContinueListeningSection />
        <RecentlyAddedSection />
        <RecentlyAddedEbooksSection />
        <RecentlyUpdatedSeriesSection />
      </div>
    </div>
  );
}
