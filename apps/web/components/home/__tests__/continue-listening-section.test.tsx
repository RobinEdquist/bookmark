import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../../../__test-utils__/render";
import { ContinueListeningSection } from "../continue-listening-section";
import type { ProgressWithAudiobook } from "../../../lib/use-progress";

// --- Hoisted mocks ---

const {
  mockUseAllProgress,
  mockUseHideProgress,
  mockUseAudiobook,
  mockUseLibraryAvailability,
  mockUseMyPermissions,
  mockUsePlayer,
} = vi.hoisted(() => ({
  mockUseAllProgress: vi.fn(),
  mockUseHideProgress: vi.fn(),
  mockUseAudiobook: vi.fn(),
  mockUseLibraryAvailability: vi.fn(),
  mockUseMyPermissions: vi.fn(),
  mockUsePlayer: vi.fn(),
}));

vi.mock("../../../lib/use-progress", () => ({
  useAllProgress: mockUseAllProgress,
  useHideProgress: mockUseHideProgress,
}));

vi.mock("../../../lib/use-audiobooks", () => ({
  useAudiobook: mockUseAudiobook,
}));

vi.mock("../../../lib/use-library-availability", () => ({
  useLibraryAvailability: mockUseLibraryAvailability,
}));

vi.mock("../../../lib/use-users", () => ({
  useMyPermissions: mockUseMyPermissions,
}));

vi.mock("../../providers/player-provider", () => ({
  usePlayer: mockUsePlayer,
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  default: ({ fill, unoptimized, ...rest }: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...rest} />;
  },
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
    div: ({ children, initial, animate, whileHover, transition, ...htmlProps }: { children?: React.ReactNode; [key: string]: unknown }) => {
      return <div {...htmlProps}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock HorizontalScrollRow to simplify rendering
vi.mock("../horizontal-scroll-row", () => ({
  HorizontalScrollRow: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
      <h2>{title}</h2>
      <div data-testid="scroll-row">{children}</div>
    </section>
  ),
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Pointer event polyfill for Radix ---
beforeEach(() => {
  class Pointer extends MouseEvent {
    pointerId: number;
    constructor(type: string, init?: PointerEventInit & { pointerId?: number }) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = Pointer;
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

// --- Test data ---

function createProgress(overrides: Partial<ProgressWithAudiobook> = {}): ProgressWithAudiobook {
  return {
    audiobookId: "ab-1",
    position: 1800,
    completed: false,
    completedAt: null,
    startedAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-06-01T12:00:00Z",
    progressPercent: 25,
    audiobook: {
      id: "ab-1",
      title: "The Great Gatsby",
      coverUrl: null,
      duration: 7200,
    },
    ...overrides,
  };
}

// --- Tests ---

describe("ContinueListeningSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseAllProgress.mockReturnValue({
      data: [
        createProgress(),
        createProgress({
          audiobookId: "ab-2",
          position: 3600,
          updatedAt: "2025-06-02T12:00:00Z",
          audiobook: { id: "ab-2", title: "1984", coverUrl: null, duration: 10800 },
        }),
      ],
      isLoading: false,
    });
    mockUseHideProgress.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockUseAudiobook.mockReturnValue({ data: null });
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: true, ebooks: false, opds: false },
      isLoading: false,
    });
    mockUseMyPermissions.mockReturnValue({
      data: { isAdmin: false },
      isLoading: false,
    });
    mockUsePlayer.mockReturnValue({
      audiobook: null,
      isPlaying: false,
      play: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    });
  });

  it("renders progress cards for in-progress audiobooks", () => {
    render(<ContinueListeningSection />);
    expect(screen.getByText("The Great Gatsby")).toBeInTheDocument();
    expect(screen.getByText("1984")).toBeInTheDocument();
  });

  it("renders the section title", () => {
    render(<ContinueListeningSection />);
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("sorts by most recently updated first", () => {
    render(<ContinueListeningSection />);
    const scrollRow = screen.getByTestId("scroll-row");
    const titles = scrollRow.querySelectorAll("h3");
    // "1984" was updated more recently (June 2nd) than "The Great Gatsby" (June 1st)
    expect(titles[0]?.textContent).toBe("1984");
    expect(titles[1]?.textContent).toBe("The Great Gatsby");
  });

  it("shows loading skeletons when data is loading", () => {
    mockUseAllProgress.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<ContinueListeningSection />);
    // Skeleton components render as divs with the skeleton class
    const skeletons = container.querySelectorAll("[class*='rounded-xl']");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("returns null when library is configured but no in-progress audiobooks", () => {
    mockUseAllProgress.mockReturnValue({ data: [], isLoading: false });
    const { container } = render(<ContinueListeningSection />);
    expect(container.innerHTML).toBe("");
  });

  it("filters out completed audiobooks", () => {
    mockUseAllProgress.mockReturnValue({
      data: [
        createProgress({ completed: true }),
        createProgress({
          audiobookId: "ab-2",
          position: 100,
          completed: false,
          audiobook: { id: "ab-2", title: "1984", coverUrl: null, duration: 10800 },
        }),
      ],
      isLoading: false,
    });
    render(<ContinueListeningSection />);
    expect(screen.queryByText("The Great Gatsby")).not.toBeInTheDocument();
    expect(screen.getByText("1984")).toBeInTheDocument();
  });

  it("filters out audiobooks with position 0", () => {
    mockUseAllProgress.mockReturnValue({
      data: [createProgress({ position: 0 })],
      isLoading: false,
    });
    const { container } = render(<ContinueListeningSection />);
    expect(container.innerHTML).toBe("");
  });

  it("shows admin empty state when audiobook library is not configured and user is admin", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: false, ebooks: false, opds: false },
      isLoading: false,
    });
    mockUseMyPermissions.mockReturnValue({
      data: { isAdmin: true },
      isLoading: false,
    });
    render(<ContinueListeningSection />);
    expect(screen.getByText("noLibraryAdmin")).toBeInTheDocument();
    expect(screen.getByText("goToSettings")).toBeInTheDocument();
  });

  it("shows regular user empty state when audiobook library is not configured and user is not admin", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: false, ebooks: false, opds: false },
      isLoading: false,
    });
    mockUseMyPermissions.mockReturnValue({
      data: { isAdmin: false },
      isLoading: false,
    });
    render(<ContinueListeningSection />);
    expect(screen.getByText("noLibraryUser")).toBeInTheDocument();
    expect(screen.queryByText("goToSettings")).not.toBeInTheDocument();
  });
});
