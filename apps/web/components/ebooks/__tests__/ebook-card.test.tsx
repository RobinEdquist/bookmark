import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../__test-utils__/render";
import { EbookCard } from "../ebook-card";
import type { EbookListItem } from "../../../lib/use-ebooks";

// --- Hoisted mocks ---

const { mockUseMyPermissions, mockUseGrFinderStatus, mockUseGoodreadsUnlinkMedia, mockUseDeleteEbook, mockUseTheme } = vi.hoisted(() => ({
  mockUseMyPermissions: vi.fn(),
  mockUseGrFinderStatus: vi.fn(),
  mockUseGoodreadsUnlinkMedia: vi.fn(),
  mockUseDeleteEbook: vi.fn(),
  mockUseTheme: vi.fn(),
}));

vi.mock("../../../lib/use-users", () => ({
  useMyPermissions: mockUseMyPermissions,
}));

vi.mock("../../../lib/use-goodreads", () => ({
  useGrFinderStatus: mockUseGrFinderStatus,
  useGoodreadsUnlinkMedia: mockUseGoodreadsUnlinkMedia,
}));

vi.mock("../../../lib/use-ebooks", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useDeleteEbook: mockUseDeleteEbook,
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

// Mock dialog components
vi.mock("../edit-ebook-dialog", () => ({
  EditEbookDialog: () => null,
}));
vi.mock("../delete-ebook-dialog", () => ({
  DeleteEbookDialog: () => null,
}));
vi.mock("../change-ebook-cover-dialog", () => ({
  ChangeEbookCoverDialog: () => null,
}));
vi.mock("../../lists/add-to-list-dialog", () => ({
  AddToListDialog: () => null,
}));
vi.mock("../../goodreads/goodreads-search-dialog", () => ({
  GoodreadsSearchDialog: () => null,
}));

// --- Test data helpers ---

function createEbook(overrides: Partial<EbookListItem> = {}): EbookListItem {
  return {
    id: "eb-1",
    title: "Dune",
    subtitle: null,
    pageCount: 412,
    coverUrl: "/api/ebooks/eb-1/cover",
    createdAt: "2025-01-01T00:00:00Z",
    status: "available",
    authors: [{ id: "auth-1", name: "Frank Herbert" }],
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

describe("EbookCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMyPermissions.mockReturnValue({ data: { canEditMetadata: false, canDelete: false } });
    mockUseGrFinderStatus.mockReturnValue({ isConfigured: false });
    mockUseGoodreadsUnlinkMedia.mockReturnValue({ unlinkMedia: vi.fn(), isUnlinking: false });
    mockUseDeleteEbook.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockUseTheme.mockReturnValue({ isDark: false, primaryColor: "orange", surfaceColor: "zinc" });
  });

  it("renders the ebook title", () => {
    render(<EbookCard ebook={createEbook()} />);
    expect(screen.getByText("Dune")).toBeInTheDocument();
  });

  it("renders the author name", () => {
    render(<EbookCard ebook={createEbook()} />);
    expect(screen.getByText("Frank Herbert")).toBeInTheDocument();
  });

  it("renders cover image when coverUrl is provided", () => {
    render(<EbookCard ebook={createEbook()} />);
    const img = screen.getByAltText("Dune");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/api/ebooks/eb-1/cover");
  });

  it("renders placeholder when coverUrl is null", () => {
    render(<EbookCard ebook={createEbook({ coverUrl: null })} />);
    expect(screen.queryByAltText("Dune")).not.toBeInTheDocument();
    expect(screen.getByText("\uD83D\uDCD6")).toBeInTheDocument();
  });

  it("links to the ebook detail page", () => {
    render(<EbookCard ebook={createEbook()} />);
    const links = screen.getAllByRole("link");
    const detailLinks = links.filter((l) => l.getAttribute("href") === "/ebooks/eb-1");
    expect(detailLinks.length).toBeGreaterThan(0);
  });

  it("renders subtitle when no series is present", () => {
    render(<EbookCard ebook={createEbook({ subtitle: "A Sci-Fi Classic" })} />);
    expect(screen.getByText("A Sci-Fi Classic")).toBeInTheDocument();
  });

  it("renders series info instead of subtitle when series is present", () => {
    render(
      <EbookCard
        ebook={createEbook({
          subtitle: "Should not appear",
          series: [{ id: "s-1", name: "Dune Saga", order: "1.0" }],
        })}
      />
    );
    expect(
      screen.getByText('bookInSeries({"series":"Dune Saga","order":"1"})')
    ).toBeInTheDocument();
    expect(screen.queryByText("Should not appear")).not.toBeInTheDocument();
  });

  it("shows missing status overlay when status is missing", () => {
    render(<EbookCard ebook={createEbook({ status: "missing" })} />);
    expect(screen.getByTitle("missingDescription")).toBeInTheDocument();
  });

  it("does not show missing overlay for available ebooks", () => {
    render(<EbookCard ebook={createEbook({ status: "available" })} />);
    expect(screen.queryByTitle("missingDescription")).not.toBeInTheDocument();
  });

  it("does not render dropdown menu when user has no permissions and integrations are off", () => {
    render(<EbookCard ebook={createEbook()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders dropdown menu when user has edit permissions", () => {
    mockUseMyPermissions.mockReturnValue({ data: { canEditMetadata: true, canDelete: false } });
    render(<EbookCard ebook={createEbook()} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("renders Goodreads rating badge when linked to Goodreads", () => {
    render(
      <EbookCard
        ebook={createEbook({
          goodreadsLinked: true,
          goodreadsRating: 4.18,
          goodreadsRatingsCount: 900000,
        })}
      />
    );
    expect(screen.getByText("4.18")).toBeInTheDocument();
    expect(screen.getByText("(900,000)")).toBeInTheDocument();
    expect(screen.getByAltText("Goodreads")).toBeInTheDocument();
  });

  it("renders Hardcover rating badge when linked to Hardcover but not Goodreads", () => {
    render(
      <EbookCard
        ebook={createEbook({
          hardcoverLinked: true,
          hardcoverRating: 4.0,
          hardcoverRatingsCount: 350,
        })}
      />
    );
    expect(screen.getByText("4.00")).toBeInTheDocument();
    expect(screen.getByText("(350)")).toBeInTheDocument();
    expect(screen.getByAltText("Hardcover")).toBeInTheDocument();
  });

  it("does not render author when authors array is empty", () => {
    render(<EbookCard ebook={createEbook({ authors: [] })} />);
    expect(screen.queryByText("Frank Herbert")).not.toBeInTheDocument();
  });

  it("applies grayscale style to cover image when missing", () => {
    render(<EbookCard ebook={createEbook({ status: "missing" })} />);
    const img = screen.getByAltText("Dune");
    expect(img.className).toContain("grayscale");
  });
});
