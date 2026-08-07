import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { BookmarksList } from "../bookmarks-list";

// --- Hoisted mocks ---

const { mockUseUserBookmarks } = vi.hoisted(() => ({
  mockUseUserBookmarks: vi.fn(),
}));

vi.mock("../../../lib/use-bookmarks", () => ({
  useUserBookmarks: mockUseUserBookmarks,
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
    id: "bm-1",
    audiobookId: "book-1",
    audiobookTitle: "Project Hail Mary",
    authorName: "Andy Weir",
    coverUrl: "/api/audiobooks/book-1/cover",
    note: "The lighthouse scene",
    position: 4523,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BookmarksList", () => {
  it("shows the empty state when there are no bookmarks", () => {
    mockUseUserBookmarks.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("renders note as title with the audiobook as subtitle", () => {
    mockUseUserBookmarks.mockReturnValue({
      data: { items: [makeItem()], total: 1 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.getByText("The lighthouse scene")).toBeInTheDocument();
    expect(screen.getByText("Project Hail Mary")).toBeInTheDocument();
    expect(screen.getByText("1:15:23")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/audiobooks/book-1",
    );
  });

  it("promotes the audiobook title when a bookmark has no note", () => {
    mockUseUserBookmarks.mockReturnValue({
      data: { items: [makeItem({ note: null })], total: 1 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.getByText("Project Hail Mary")).toBeInTheDocument();
    expect(screen.getByText("Andy Weir")).toBeInTheDocument();
  });

  it("pages through results with the next button", async () => {
    mockUseUserBookmarks.mockReturnValue({
      data: { items: [makeItem()], total: 45 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(mockUseUserBookmarks).toHaveBeenLastCalledWith("me", 0, 20);

    await userEvent.click(screen.getByRole("button", { name: "next" }));

    expect(mockUseUserBookmarks).toHaveBeenLastCalledWith("me", 20, 20);
  });

  it("disables the previous button on the first page", () => {
    mockUseUserBookmarks.mockReturnValue({
      data: { items: [makeItem()], total: 45 },
      isLoading: false,
    });

    render(<BookmarksList userId="me" />);

    expect(screen.getByRole("button", { name: "previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "next" })).toBeEnabled();
  });
});
