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

vi.mock("../../../lib/use-metadata-gaps", () => ({
  useMetadataGaps: (filters: unknown) => mockUseMetadataGaps(filters),
  useMetadataGapsSummary: (type: unknown) => mockUseMetadataGapsSummary(type),
}));

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
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
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
    { key: "description", count: 20, fixableBy: "link" },
    { key: "narrator", count: 30, fixableBy: "manual" },
    { key: "genres", count: 12, fixableBy: "manual" },
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
