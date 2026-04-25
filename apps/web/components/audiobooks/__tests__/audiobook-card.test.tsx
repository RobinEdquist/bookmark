import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../__test-utils__/render";
import { AudiobookCard } from "../audiobook-card";
import type { AudiobookListItem } from "../../../lib/use-audiobooks";

// --- Hoisted mocks ---

const { mockUseMyPermissions, mockUseHardcoverStatus, mockUseGrFinderStatus, mockUseHardcoverUnlinkAudiobook, mockUseGoodreadsUnlinkMedia, mockUseDeleteAudiobook, mockUseTheme } = vi.hoisted(() => ({
  mockUseMyPermissions: vi.fn(),
  mockUseHardcoverStatus: vi.fn(),
  mockUseGrFinderStatus: vi.fn(),
  mockUseHardcoverUnlinkAudiobook: vi.fn(),
  mockUseGoodreadsUnlinkMedia: vi.fn(),
  mockUseDeleteAudiobook: vi.fn(),
  mockUseTheme: vi.fn(),
}));

vi.mock("../../../lib/use-users", () => ({
  useMyPermissions: mockUseMyPermissions,
}));

vi.mock("../../../lib/use-hardcover", () => ({
  useHardcoverStatus: mockUseHardcoverStatus,
  useHardcoverUnlinkAudiobook: mockUseHardcoverUnlinkAudiobook,
}));

vi.mock("../../../lib/use-goodreads", () => ({
  useGrFinderStatus: mockUseGrFinderStatus,
  useGoodreadsUnlinkMedia: mockUseGoodreadsUnlinkMedia,
}));

vi.mock("../../../lib/use-audiobooks", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useDeleteAudiobook: mockUseDeleteAudiobook,
  };
});

vi.mock("../../../lib/use-theme", () => ({
  useTheme: mockUseTheme,
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  default: ({ fill, unoptimized, ...rest }: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...rest} />
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  ),
}));

// Mock motion components to render plain elements
vi.mock("motion/react", () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    article: ({ children, initial, animate, whileHover, transition, ...htmlProps }: Record<string, unknown>) => (
      <article {...htmlProps}>{children as React.ReactNode}</article>
    ),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    div: ({ children, initial, animate, whileHover, transition, ...htmlProps }: Record<string, unknown>) => (
      <div {...htmlProps}>{children as React.ReactNode}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock dialog components to avoid complex rendering
vi.mock("../edit-audiobook-dialog", () => ({
  EditAudiobookDialog: () => null,
}));
vi.mock("../../hardcover/hardcover-sync-dialog", () => ({
  HardcoverSyncDialog: () => null,
}));
vi.mock("../../goodreads/goodreads-search-dialog", () => ({
  GoodreadsSearchDialog: () => null,
}));
vi.mock("../delete-audiobook-dialog", () => ({
  DeleteAudiobookDialog: () => null,
}));
vi.mock("../change-cover-dialog", () => ({
  ChangeCoverDialog: () => null,
}));
vi.mock("../../lists/add-to-list-dialog", () => ({
  AddToListDialog: () => null,
}));

// --- Test data helpers ---

function createAudiobook(overrides: Partial<AudiobookListItem> = {}): AudiobookListItem {
  return {
    id: "ab-1",
    title: "The Great Gatsby",
    subtitle: null,
    duration: 36000,
    coverUrl: "/api/audiobooks/ab-1/cover",
    createdAt: "2025-01-01T00:00:00Z",
    status: "available",
    authors: [{ id: "auth-1", name: "F. Scott Fitzgerald" }],
    series: [],
    hardcoverLinked: false,
    hardcoverRating: null,
    hardcoverRatingsCount: null,
    goodreadsLinked: false,
    goodreadsRating: null,
    goodreadsRatingsCount: null,
    ...overrides,
  };
}

// --- Tests ---

describe("AudiobookCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyPermissions.mockReturnValue({ data: { canEditMetadata: false, canDelete: false } });
    mockUseHardcoverStatus.mockReturnValue({ isConfigured: false });
    mockUseGrFinderStatus.mockReturnValue({ isConfigured: false });
    mockUseHardcoverUnlinkAudiobook.mockReturnValue({ unlinkAudiobook: vi.fn(), isUnlinking: false });
    mockUseGoodreadsUnlinkMedia.mockReturnValue({ unlinkMedia: vi.fn(), isUnlinking: false });
    mockUseDeleteAudiobook.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseTheme.mockReturnValue({ isDark: false, primaryColor: "orange", surfaceColor: "zinc" });
  });

  it("renders the audiobook title", () => {
    render(<AudiobookCard audiobook={createAudiobook()} />);
    expect(screen.getByText("The Great Gatsby")).toBeInTheDocument();
  });

  it("renders the author name", () => {
    render(<AudiobookCard audiobook={createAudiobook()} />);
    expect(screen.getByText("F. Scott Fitzgerald")).toBeInTheDocument();
  });

  it("renders cover image when coverUrl is provided", () => {
    render(<AudiobookCard audiobook={createAudiobook()} />);
    const img = screen.getByAltText("The Great Gatsby");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/api/audiobooks/ab-1/cover");
  });

  it("renders placeholder when coverUrl is null", () => {
    render(<AudiobookCard audiobook={createAudiobook({ coverUrl: null })} />);
    expect(screen.queryByAltText("The Great Gatsby")).not.toBeInTheDocument();
    expect(screen.getByText("\uD83D\uDCDA")).toBeInTheDocument();
  });

  it("links to the audiobook detail page", () => {
    render(<AudiobookCard audiobook={createAudiobook()} />);
    const links = screen.getAllByRole("link");
    const detailLinks = links.filter((l) => l.getAttribute("href") === "/audiobooks/ab-1");
    expect(detailLinks.length).toBeGreaterThan(0);
  });

  it("renders subtitle when no series is present", () => {
    render(
      <AudiobookCard audiobook={createAudiobook({ subtitle: "A Novel of the Jazz Age" })} />
    );
    expect(screen.getByText("A Novel of the Jazz Age")).toBeInTheDocument();
  });

  it("renders series info instead of subtitle when series is present", () => {
    render(
      <AudiobookCard
        audiobook={createAudiobook({
          subtitle: "Should not appear",
          series: [{ id: "s-1", name: "Gatsby Chronicles", order: "1.0" }],
        })}
      />
    );
    // The translation mock returns: key(JSON.stringify(values))
    expect(
      screen.getByText('bookInSeries({"series":"Gatsby Chronicles","order":"1"})')
    ).toBeInTheDocument();
    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });

  it("shows missing status overlay when status is missing", () => {
    render(<AudiobookCard audiobook={createAudiobook({ status: "missing" })} />);
    expect(screen.getByTitle("missingDescription")).toBeInTheDocument();
  });

  it("does not show missing overlay for available audiobooks", () => {
    render(<AudiobookCard audiobook={createAudiobook({ status: "available" })} />);
    expect(screen.queryByTitle("missingDescription")).not.toBeInTheDocument();
  });

  it("renders dropdown menu even when user has no permissions (for add to list)", () => {
    render(<AudiobookCard audiobook={createAudiobook()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders dropdown menu when user has edit permissions", () => {
    mockUseMyPermissions.mockReturnValue({ data: { canEditMetadata: true, canDelete: false } });
    render(<AudiobookCard audiobook={createAudiobook()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders Goodreads rating badge when linked to Goodreads", () => {
    render(
      <AudiobookCard
        audiobook={createAudiobook({
          goodreadsLinked: true,
          goodreadsRating: 4.25,
          goodreadsRatingsCount: 1500,
        })}
      />
    );
    expect(screen.getByText("4.25")).toBeInTheDocument();
    expect(screen.getByText("(1,500)")).toBeInTheDocument();
    expect(screen.getByAltText("Goodreads")).toBeInTheDocument();
  });

  it("renders Hardcover rating badge when linked to Hardcover but not Goodreads", () => {
    render(
      <AudiobookCard
        audiobook={createAudiobook({
          hardcoverLinked: true,
          hardcoverRating: 3.75,
          hardcoverRatingsCount: 200,
        })}
      />
    );
    expect(screen.getByText("3.75")).toBeInTheDocument();
    expect(screen.getByText("(200)")).toBeInTheDocument();
    expect(screen.getByAltText("Hardcover")).toBeInTheDocument();
  });

  it("prefers Goodreads badge over Hardcover when both are linked", () => {
    render(
      <AudiobookCard
        audiobook={createAudiobook({
          hardcoverLinked: true,
          hardcoverRating: 3.75,
          hardcoverRatingsCount: 200,
          goodreadsLinked: true,
          goodreadsRating: 4.1,
          goodreadsRatingsCount: 5000,
        })}
      />
    );
    // Should show Goodreads, not Hardcover
    expect(screen.getByText("4.10")).toBeInTheDocument();
    // Hardcover badge in the text area should not appear
    // (the Goodreads one shows, Hardcover is hidden when both are linked)
    expect(screen.queryByText("3.75")).not.toBeInTheDocument();
  });

  it("does not render author when authors array is empty", () => {
    render(<AudiobookCard audiobook={createAudiobook({ authors: [] })} />);
    expect(screen.queryByText("F. Scott Fitzgerald")).not.toBeInTheDocument();
  });

  it("applies grayscale style to cover image when missing", () => {
    render(
      <AudiobookCard audiobook={createAudiobook({ status: "missing" })} />
    );
    const img = screen.getByAltText("The Great Gatsby");
    expect(img.className).toContain("grayscale");
  });
});
