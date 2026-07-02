import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "../../../__test-utils__/render";
import { HomeScreen } from "../home-screen";

// --- Hoisted mocks ---

const { mockUseLibraryAvailability, mockUseMyPermissions } = vi.hoisted(() => ({
  mockUseLibraryAvailability: vi.fn(),
  mockUseMyPermissions: vi.fn(),
}));

vi.mock("../../../lib/use-library-availability", () => ({
  useLibraryAvailability: mockUseLibraryAvailability,
}));

vi.mock("../../../lib/use-users", () => ({
  useMyPermissions: mockUseMyPermissions,
}));

// Stub the onboarding views with buttons so we can drive finish/skip.
vi.mock("../library-setup-onboarding", () => ({
  LibrarySetupOnboarding: ({
    onFinish,
    onSkip,
  }: {
    onFinish: () => void;
    onSkip: () => void;
  }) => (
    <div data-testid="wizard">
      <button onClick={onFinish}>wizard-finish</button>
      <button onClick={onSkip}>wizard-skip</button>
    </div>
  ),
  WaitingForSetup: () => <div data-testid="waiting" />,
}));

// Stub every feed section so the feed is cheap and detectable.
vi.mock("../announcement-banner", () => ({ AnnouncementBanner: () => null }));
vi.mock("../continue-listening-section", () => ({
  ContinueListeningSection: () => <div data-testid="feed-section" />,
}));
vi.mock("../continue-reading-section", () => ({
  ContinueReadingSection: () => null,
}));
vi.mock("../recently-added-section", () => ({
  RecentlyAddedSection: () => null,
}));
vi.mock("../recently-added-ebooks-section", () => ({
  RecentlyAddedEbooksSection: () => null,
}));
vi.mock("../recently-added-comics-section", () => ({
  RecentlyAddedComicsSection: () => null,
}));
vi.mock("../recently-updated-lists-section", () => ({
  RecentlyUpdatedListsSection: () => null,
}));
vi.mock("../recently-updated-series-section", () => ({
  RecentlyUpdatedSeriesSection: () => null,
}));

function setAvailability(
  value: {
    audiobooks: boolean;
    ebooks: boolean;
    comics: boolean;
    opds: boolean;
  } | null,
  isLoading = false
) {
  mockUseLibraryAvailability.mockReturnValue({ data: value, isLoading });
}

function setAdmin(isAdmin: boolean, isLoading = false) {
  mockUseMyPermissions.mockReturnValue({ data: { isAdmin }, isLoading });
}

const NONE = { audiobooks: false, ebooks: false, comics: false, opds: false };
const SOME = { audiobooks: true, ebooks: false, comics: false, opds: false };

describe("HomeScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a loading state while availability is loading", () => {
    setAvailability(null, true);
    setAdmin(true, true);
    render(<HomeScreen />);
    expect(screen.queryByTestId("wizard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("waiting")).not.toBeInTheDocument();
    expect(screen.queryByTestId("feed-section")).not.toBeInTheDocument();
  });

  it("shows the setup wizard for an admin with no libraries configured", async () => {
    setAvailability(NONE);
    setAdmin(true);
    render(<HomeScreen />);
    expect(await screen.findByTestId("wizard")).toBeInTheDocument();
  });

  it("shows the waiting screen for a non-admin with no libraries configured", () => {
    setAvailability(NONE);
    setAdmin(false);
    render(<HomeScreen />);
    expect(screen.getByTestId("waiting")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard")).not.toBeInTheDocument();
  });

  it("shows the normal feed once at least one library is configured", async () => {
    setAvailability(SOME);
    setAdmin(true);
    render(<HomeScreen />);
    expect(await screen.findByTestId("feed-section")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard")).not.toBeInTheDocument();
  });

  it("offers a resume banner after skipping, and reopens the wizard", async () => {
    setAvailability(NONE);
    setAdmin(true);
    render(<HomeScreen />);

    await userEvent.click(await screen.findByText("wizard-skip"));

    // Skipped + still unconfigured → resume banner, no feed sections.
    expect(await screen.findByText("action")).toBeInTheDocument();
    expect(screen.queryByTestId("wizard")).not.toBeInTheDocument();
    expect(screen.queryByTestId("feed-section")).not.toBeInTheDocument();

    // Resume brings the wizard back.
    await userEvent.click(screen.getByText("action"));
    expect(await screen.findByTestId("wizard")).toBeInTheDocument();
  });

  it("does not reopen the wizard on reload once dismissed", async () => {
    localStorage.setItem("bookmark.onboarding.dismissed", "true");
    setAvailability(NONE);
    setAdmin(true);
    render(<HomeScreen />);

    // Dismissed → straight to the resume banner, not the full wizard.
    expect(await screen.findByText("action")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("wizard")).not.toBeInTheDocument()
    );
  });
});
