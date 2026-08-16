import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { MetadataGapsPanel } from "../metadata-gaps-panel";
import type {
  MetadataGapItem,
  MetadataGapsSummary,
} from "../../../lib/use-metadata-gaps";

const { mockUseMetadataGaps, mockUseMetadataGapsSummary } = vi.hoisted(() => ({
  mockUseMetadataGaps: vi.fn(),
  mockUseMetadataGapsSummary: vi.fn(),
}));

/**
 * The panel keeps its filters in the URL, so a spy-only router mock is not
 * enough — a write has to come back out of `useSearchParams` and re-render,
 * the way the real router behaves. This is a tiny stateful stand-in for it.
 */
const urlStore = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let search = "";
  return {
    subscribe: (onChange: () => void) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    read: () => search,
    write: (next: string) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => "/metadata",
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(urlStore.subscribe, urlStore.read, urlStore.read),
      ),
    useRouter: () => ({
      replace: (url: string) => urlStore.write(url.split("?")[1] ?? ""),
      push: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

// Only the hooks are stubbed — the module also exports real constants the
// chips render from, so the rest has to come through untouched.
vi.mock("../../../lib/use-metadata-gaps", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useMetadataGaps: (filters: unknown, options: unknown) =>
    mockUseMetadataGaps(filters, options),
  useMetadataGapsSummary: (type: unknown) => mockUseMetadataGapsSummary(type),
}));

vi.mock("../../chapters/chapter-import-dialog", () => ({
  ChapterImportDialog: ({ audiobookTitle }: { audiobookTitle: string }) => (
    <div data-testid="chapter-import">{audiobookTitle}</div>
  ),
}));

const { mockUseAudiobook } = vi.hoisted(() => ({ mockUseAudiobook: vi.fn() }));
vi.mock("../../../lib/use-audiobooks", () => ({
  useAudiobook: (id: string) => mockUseAudiobook(id),
}));

/** The query string the panel has written so far. */
function currentUrl() {
  return urlStore.read();
}

// The panel only wires these up; they have their own tests.
vi.mock("../../audiobooks/edit-audiobook-dialog", () => ({
  EditAudiobookDialog: () => null,
}));
vi.mock("../../ebooks/edit-ebook-dialog", () => ({
  EditEbookDialog: () => null,
}));
vi.mock("../../goodreads/goodreads-search-dialog", () => ({
  GoodreadsSearchDialog: () => null,
}));
vi.mock("../../hardcover/hardcover-sync-dialog", () => ({
  HardcoverSyncDialog: () => null,
}));
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

const SUMMARY: MetadataGapsSummary = {
  type: "audiobook",
  totalItems: 100,
  itemsWithGaps: 60,
  gaps: [
    { key: "description", count: 20, category: "essentials" },
    { key: "narrator", count: 30, category: "publication" },
    { key: "genres", count: 12, category: "publication" },
  ],
};

function item(id: string): MetadataGapItem {
  return {
    id,
    type: "audiobook",
    title: `Book ${id}`,
    subtitle: null,
    gaps: ["publisher"],
    gapCount: 1,
    coverUrl: null,
    status: "available",
    createdAt: "2026-08-01T00:00:00.000Z",
  };
}

/**
 * Chips and row badges share their label text, so chips are addressed by role:
 * only the chip is a button.
 */
function chip(key: string) {
  const found = screen
    .getAllByText(`gaps.${key}`)
    .map((element) => element.closest("button"))
    .find((button): button is HTMLButtonElement => button !== null);
  if (!found) throw new Error(`no filter chip for ${key}`);
  return found;
}

/** The filters the panel passed to the list hook on its most recent render. */
function lastFilters() {
  const calls = mockUseMetadataGaps.mock.calls;
  return calls[calls.length - 1]?.[0];
}

describe("MetadataGapsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    urlStore.write("");
    mockUseAudiobook.mockReturnValue({ data: undefined });
    mockUseMetadataGapsSummary.mockReturnValue({
      data: SUMMARY,
      isLoading: false,
    });
    mockUseMetadataGaps.mockReturnValue({
      data: { items: [item("a")], total: 1 },
      isLoading: false,
      isFetching: false,
    });
  });

  it("asks for everything with a gap until chips are selected", () => {
    render(<MetadataGapsPanel type="audiobook" />);

    expect(lastFilters()).toMatchObject({ type: "audiobook", missing: [] });
  });

  it("filters by the chips that are selected", async () => {
    render(<MetadataGapsPanel type="audiobook" />);

    await userEvent.click(chip("description"));

    expect(lastFilters().missing).toEqual(["description"]);
  });

  it("only offers the any/all toggle once two chips are selected", async () => {
    render(<MetadataGapsPanel type="audiobook" />);

    expect(screen.queryByText("match.all")).not.toBeInTheDocument();

    await userEvent.click(chip("description"));
    expect(screen.queryByText("match.all")).not.toBeInTheDocument();

    await userEvent.click(chip("narrator"));
    expect(screen.getByText("match.all")).toBeInTheDocument();
  });

  it("drops match back to any when the selection shrinks below two", async () => {
    // The toggle unmounts below two chips, so a lingering "all" would keep
    // intersecting every gap with no visible control to undo it.
    render(<MetadataGapsPanel type="audiobook" />);

    await userEvent.click(chip("description"));
    await userEvent.click(chip("narrator"));
    await userEvent.click(screen.getByText("match.all"));
    expect(lastFilters().match).toBe("all");

    await userEvent.click(chip("narrator"));

    expect(lastFilters().match).toBe("any");
  });

  it("drops match back to any when the filters are cleared", async () => {
    render(<MetadataGapsPanel type="audiobook" />);

    await userEvent.click(chip("description"));
    await userEvent.click(chip("narrator"));
    await userEvent.click(screen.getByText("match.all"));

    await userEvent.click(screen.getByText("clearFilters"));

    expect(lastFilters()).toMatchObject({ missing: [], match: "any" });
  });

  it("keeps the pager reachable when the list shrinks under the reader", async () => {
    // Fixing items removes them from the worklist. If the pager only rendered
    // for total > PAGE_SIZE it would vanish exactly when the total dropped,
    // stranding an empty offset with no way back.
    mockUseMetadataGaps.mockReturnValue({
      data: { items: [item("a")], total: 120 },
      isLoading: false,
      isFetching: false,
    });
    const view = render(<MetadataGapsPanel type="audiobook" />);

    await userEvent.click(screen.getByText("next"));
    expect(lastFilters().offset).toBe(50);

    // The shrink arrives through query invalidation after a fix, which
    // re-renders without touching the filters — so `page` stays where it was.
    mockUseMetadataGaps.mockReturnValue({
      data: { items: [], total: 12 },
      isLoading: false,
      isFetching: false,
    });
    view.rerender(<MetadataGapsPanel type="audiobook" />);

    expect(screen.getByText("previous")).toBeInTheDocument();
    expect(screen.getByText("previous")).not.toBeDisabled();
  });

  describe("filters in the URL", () => {
    it("restores the filter from the URL on mount", () => {
      // What "press Back and the filter is still applied" comes down to: the
      // panel is remounted and has to read its whole state off the URL.
      urlStore.write(
        "missing=description,narrator&match=all&sort=title&page=3",
      );
      render(<MetadataGapsPanel type="audiobook" />);

      expect(lastFilters()).toMatchObject({
        missing: ["description", "narrator"],
        match: "all",
        sort: "title",
        offset: 100,
      });
    });

    it("writes filter changes to the URL", async () => {
      render(<MetadataGapsPanel type="audiobook" />);

      await userEvent.click(chip("description"));

      expect(currentUrl()).toContain("missing=description");
    });

    it("keeps defaults out of the URL", async () => {
      render(<MetadataGapsPanel type="audiobook" />);

      await userEvent.click(chip("description"));
      await userEvent.click(chip("description"));

      // Round-tripping back to the default state should leave a clean URL,
      // not `?missing=&match=any&page=1`.
      expect(currentUrl()).toBe("");
    });

    it("ignores a gap key the media type does not have", () => {
      // A hand-edited or stale URL must not reach the API: an unknown key is
      // a 400 that would blank the whole list.
      urlStore.write("missing=description,bogus");
      render(<MetadataGapsPanel type="audiobook" />);

      expect(lastFilters().missing).toEqual(["description"]);
    });

    it("holds the list back until the valid gap keys are known", () => {
      mockUseMetadataGapsSummary.mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      render(<MetadataGapsPanel type="audiobook" />);

      const options = mockUseMetadataGaps.mock.calls.at(-1)?.[1];
      expect(options).toMatchObject({ enabled: false });
    });

    it("reads page as 1-based and matches it to the offset", () => {
      urlStore.write("page=2");
      render(<MetadataGapsPanel type="audiobook" />);

      expect(lastFilters().offset).toBe(50);
    });
  });

  describe("chapter import", () => {
    it("offers the Audible import for audiobooks only", async () => {
      render(<MetadataGapsPanel type="ebook" />);
      await userEvent.click(screen.getAllByLabelText("table.actions")[0]!);

      expect(
        screen.queryByText("actions.importChapters"),
      ).not.toBeInTheDocument();
    });

    it("waits for the audiobook before opening the import dialog", async () => {
      // The dialog seeds its search fields from props on mount, so opening it
      // without the author would strand an empty author in the form.
      render(<MetadataGapsPanel type="audiobook" />);
      await userEvent.click(screen.getAllByLabelText("table.actions")[0]!);
      await userEvent.click(screen.getByText("actions.importChapters"));

      expect(screen.queryByTestId("chapter-import")).not.toBeInTheDocument();
    });

    it("opens the import dialog once the audiobook has loaded", async () => {
      mockUseAudiobook.mockReturnValue({
        data: {
          id: "a",
          title: "The Way of Kings",
          authors: [{ id: "p1", name: "Brandon Sanderson" }],
          chapters: [],
        },
      });
      render(<MetadataGapsPanel type="audiobook" />);
      await userEvent.click(screen.getAllByLabelText("table.actions")[0]!);
      await userEvent.click(screen.getByText("actions.importChapters"));

      expect(screen.getByTestId("chapter-import")).toHaveTextContent(
        "The Way of Kings",
      );
    });
  });

  it("returns to the first page whenever the filter changes", async () => {
    mockUseMetadataGaps.mockReturnValue({
      data: { items: [item("a")], total: 120 },
      isLoading: false,
      isFetching: false,
    });
    render(<MetadataGapsPanel type="audiobook" />);

    await userEvent.click(screen.getByText("next"));
    expect(lastFilters().offset).toBe(50);

    await userEvent.click(chip("description"));

    expect(lastFilters().offset).toBe(0);
  });
});
