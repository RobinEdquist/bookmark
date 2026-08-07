import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { BookmarksSection } from "../bookmarks-section";
import type { AudiobookDetail } from "../../../lib/use-audiobooks";
import type { AudiobookProgress } from "../../../lib/use-progress";

// --- Hoisted mocks ---

const {
  mockUseAudiobookBookmarks,
  mockUseCreateBookmark,
  mockUseUpdateBookmark,
  mockUseDeleteBookmark,
  mockGenerateBookmarkId,
  mockUsePlayer,
  mockUseConfirmDismissed,
  mockSetConfirmDismissed,
} = vi.hoisted(() => ({
  mockUseAudiobookBookmarks: vi.fn(),
  mockUseCreateBookmark: vi.fn(),
  mockUseUpdateBookmark: vi.fn(),
  mockUseDeleteBookmark: vi.fn(),
  mockGenerateBookmarkId: vi.fn(),
  mockUsePlayer: vi.fn(),
  mockUseConfirmDismissed: vi.fn(),
  mockSetConfirmDismissed: vi.fn(),
}));

vi.mock("../../../lib/use-bookmarks", () => ({
  useAudiobookBookmarks: mockUseAudiobookBookmarks,
  useCreateBookmark: mockUseCreateBookmark,
  useUpdateBookmark: mockUseUpdateBookmark,
  useDeleteBookmark: mockUseDeleteBookmark,
  generateBookmarkId: mockGenerateBookmarkId,
}));

vi.mock("../../providers/player-provider", () => ({
  usePlayer: mockUsePlayer,
}));

vi.mock("../../../lib/use-bookmark-play-confirm-dismissed", () => ({
  useBookmarkPlayConfirmDismissed: mockUseConfirmDismissed,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("motion/react", () => ({
  motion: {
    div: ({
      children,
      initial,
      animate,
      exit,
      transition,
      ...htmlProps
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => <div {...htmlProps}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// --- Fixtures ---

const audiobook = {
  id: "book-1",
  title: "Test Book",
  duration: 36000,
  chapters: [],
} as unknown as AudiobookDetail;

function makeBookmark(overrides: Record<string, unknown> = {}) {
  return {
    id: "bm-1",
    audiobookId: "book-1",
    note: "The lighthouse scene",
    position: 4523,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function makeProgress(position: number): AudiobookProgress {
  return {
    audiobookId: "book-1",
    position,
    completed: false,
    completedAt: null,
    startedAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
  } as AudiobookProgress;
}

function playerState(overrides: Record<string, unknown> = {}) {
  return {
    audiobook: null,
    isPlaying: false,
    play: vi.fn(),
    resume: vi.fn(),
    seek: vi.fn(),
    ...overrides,
  };
}

async function openSection() {
  await userEvent.click(screen.getByRole("button", { name: /title \(/ }));
}

const playButton = () => screen.getByRole("button", { name: /playFrom/ });

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAudiobookBookmarks.mockReturnValue({ data: [makeBookmark()] });
  mockUseCreateBookmark.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUseUpdateBookmark.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUseDeleteBookmark.mockReturnValue({ mutate: vi.fn(), isPending: false });
  mockUsePlayer.mockReturnValue(playerState());
  mockUseConfirmDismissed.mockReturnValue([false, mockSetConfirmDismissed]);
});

describe("BookmarksSection", () => {
  it("renders nothing while loading or when the user has no bookmarks", () => {
    mockUseAudiobookBookmarks.mockReturnValue({ data: undefined });
    const { container, rerender } = render(
      <BookmarksSection audiobook={audiobook} progress={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();

    mockUseAudiobookBookmarks.mockReturnValue({ data: [] });
    rerender(<BookmarksSection audiobook={audiobook} progress={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the bookmark count and rows with note and timestamp", async () => {
    render(<BookmarksSection audiobook={audiobook} progress={undefined} />);

    expect(screen.getByText(/title \(1\)/)).toBeInTheDocument();

    await openSection();

    expect(screen.getByText("The lighthouse scene")).toBeInTheDocument();
    expect(screen.getByText("1:15:23")).toBeInTheDocument();
  });

  it("falls back to the timestamp when a bookmark has no note", async () => {
    mockUseAudiobookBookmarks.mockReturnValue({
      data: [makeBookmark({ note: null, position: 754 })],
    });
    render(<BookmarksSection audiobook={audiobook} progress={undefined} />);

    await openSection();

    expect(screen.getByText("12:34")).toBeInTheDocument();
  });

  it("seeks directly when this audiobook is already playing", async () => {
    const player = playerState({
      audiobook: { id: "book-1" },
      isPlaying: true,
    });
    mockUsePlayer.mockReturnValue(player);
    render(
      <BookmarksSection audiobook={audiobook} progress={makeProgress(100)} />,
    );

    await openSection();
    await userEvent.click(playButton());

    expect(player.seek).toHaveBeenCalledWith(4523);
    expect(player.resume).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
  });

  it("seeks and resumes when this audiobook is loaded but paused", async () => {
    const player = playerState({
      audiobook: { id: "book-1" },
      isPlaying: false,
    });
    mockUsePlayer.mockReturnValue(player);
    render(<BookmarksSection audiobook={audiobook} progress={undefined} />);

    await openSection();
    await userEvent.click(playButton());

    expect(player.seek).toHaveBeenCalledWith(4523);
    expect(player.resume).toHaveBeenCalled();
  });

  it("plays immediately when there is no meaningful saved progress", async () => {
    const player = playerState();
    mockUsePlayer.mockReturnValue(player);
    render(<BookmarksSection audiobook={audiobook} progress={undefined} />);

    await openSection();
    await userEvent.click(playButton());

    expect(player.play).toHaveBeenCalledWith(audiobook, 4523);
    expect(screen.queryByText("playConfirmTitle")).not.toBeInTheDocument();
  });

  it("warns before moving progress and plays after confirmation", async () => {
    const player = playerState();
    mockUsePlayer.mockReturnValue(player);
    render(
      <BookmarksSection audiobook={audiobook} progress={makeProgress(20000)} />,
    );

    await openSection();
    await userEvent.click(playButton());

    expect(player.play).not.toHaveBeenCalled();
    expect(screen.getByText("playConfirmTitle")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "playConfirmAction" }),
    );

    expect(player.play).toHaveBeenCalledWith(audiobook, 4523);
  });

  it("persists the dismiss flag when 'don't ask again' is checked", async () => {
    const player = playerState();
    mockUsePlayer.mockReturnValue(player);
    render(
      <BookmarksSection audiobook={audiobook} progress={makeProgress(20000)} />,
    );

    await openSection();
    await userEvent.click(playButton());
    await userEvent.click(
      screen.getByRole("checkbox", { name: "playConfirmDontAskAgain" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "playConfirmAction" }),
    );

    expect(mockSetConfirmDismissed).toHaveBeenCalledWith(true);
    expect(player.play).toHaveBeenCalledWith(audiobook, 4523);
  });

  it("skips the warning when the user previously dismissed it", async () => {
    mockUseConfirmDismissed.mockReturnValue([true, mockSetConfirmDismissed]);
    const player = playerState();
    mockUsePlayer.mockReturnValue(player);
    render(
      <BookmarksSection audiobook={audiobook} progress={makeProgress(20000)} />,
    );

    await openSection();
    await userEvent.click(playButton());

    expect(player.play).toHaveBeenCalledWith(audiobook, 4523);
    expect(screen.queryByText("playConfirmTitle")).not.toBeInTheDocument();
  });

  it("skips the warning when the bookmark is near the saved progress", async () => {
    const player = playerState();
    mockUsePlayer.mockReturnValue(player);
    render(
      <BookmarksSection audiobook={audiobook} progress={makeProgress(4520)} />,
    );

    await openSection();
    await userEvent.click(playButton());

    expect(player.play).toHaveBeenCalledWith(audiobook, 4523);
    expect(screen.queryByText("playConfirmTitle")).not.toBeInTheDocument();
  });

  it("opens the edit dialog from the pencil button", async () => {
    render(<BookmarksSection audiobook={audiobook} progress={undefined} />);

    await openSection();
    await userEvent.click(screen.getByRole("button", { name: "edit" }));

    expect(screen.getByText("editTitle")).toBeInTheDocument();
    expect(screen.getByLabelText("note")).toHaveValue("The lighthouse scene");
  });
});
