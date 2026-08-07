import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { BookmarksList, AllBookmarksList } from "../bookmarks-list";

// --- Hoisted mocks ---

const { mockUseBookmarkedAudiobooks } = vi.hoisted(() => ({
  mockUseBookmarkedAudiobooks: vi.fn(),
}));

vi.mock("../../../lib/use-bookmarks", () => ({
  useBookmarkedAudiobooks: mockUseBookmarkedAudiobooks,
}));

vi.mock("next/image", () => ({
  default: ({ fill, unoptimized, ...rest }: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...rest} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a {...props}>{children}</a>,
}));

// --- Fixtures ---

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    audiobookId: "book-1",
    audiobookTitle: "Project Hail Mary",
    authorName: "Andy Weir",
    coverUrl: "/api/audiobooks/book-1/cover",
    bookmarkCount: 5,
    latestBookmarkAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BookmarksList (profile section)", () => {
  it("shows the empty state when no book has bookmarks", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("requests only the 5 most recent books", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [makeItem()], total: 1 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(mockUseBookmarkedAudiobooks).toHaveBeenCalledWith("me", 0, 5);
  });

  it("renders one row per book with its bookmark count, linking to the book", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [makeItem()], total: 1 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.getByText("Project Hail Mary")).toBeInTheDocument();
    expect(screen.getByText("Andy Weir")).toBeInTheDocument();
    // next-intl is mocked to echo the key plus its values, so the count
    // being passed through is visible in the rendered label.
    expect(screen.getByText('bookmarkCount({"count":5})')).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/audiobooks/book-1",
    );
  });

  it("links to the full bookmarks page when there are more than 5 books", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: {
        items: Array.from({ length: 5 }, (_, i) =>
          makeItem({ audiobookId: `book-${i}` }),
        ),
        total: 12,
      },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    const seeAll = screen.getByText('seeAll({"total":12}) →');
    expect(seeAll).toHaveAttribute("href", "/users/me/bookmarks");
  });

  it("hides the see-all link when 5 or fewer books have bookmarks", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [makeItem()], total: 5 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.queryByText(/seeAll/)).not.toBeInTheDocument();
  });

  it("omits the author line when the book has no author", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [makeItem({ authorName: null })], total: 1 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.getByText("Project Hail Mary")).toBeInTheDocument();
    expect(screen.queryByText("Andy Weir")).not.toBeInTheDocument();
  });
});

describe("AllBookmarksList (dedicated page)", () => {
  it("pages through results with the next button", async () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [makeItem()], total: 45 },
      isLoading: false,
    });

    render(<AllBookmarksList userId="me" />);

    expect(mockUseBookmarkedAudiobooks).toHaveBeenLastCalledWith("me", 0, 20);

    await userEvent.click(screen.getByRole("button", { name: "next" }));

    expect(mockUseBookmarkedAudiobooks).toHaveBeenLastCalledWith("me", 20, 20);
  });

  it("disables the previous button on the first page", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [makeItem()], total: 45 },
      isLoading: false,
    });

    render(<AllBookmarksList userId="me" />);

    expect(screen.getByRole("button", { name: "previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "next" })).toBeEnabled();
  });

  it("shows the empty state when there is nothing to list", () => {
    mockUseBookmarkedAudiobooks.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    });

    render(<AllBookmarksList userId="me" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });
});
