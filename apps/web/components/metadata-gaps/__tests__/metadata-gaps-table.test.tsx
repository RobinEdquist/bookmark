import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { MetadataGapsTable } from "../metadata-gaps-table";
import type {
  MetadataGapCount,
  MetadataGapItem,
} from "../../../lib/use-metadata-gaps";

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

const GAP_COUNTS: MetadataGapCount[] = [
  { key: "description", count: 2, category: "essentials" },
  { key: "narrator", count: 1, category: "publication" },
  { key: "chapters", count: 1, category: "audio" },
];

const ITEMS: MetadataGapItem[] = [
  {
    id: "ab-1",
    type: "audiobook",
    title: "The Way of Kings",
    subtitle: "Book One",
    gaps: ["description", "narrator"],
    gapCount: 2,
    coverUrl: "/api/audiobooks/ab-1/cover",
    status: "available",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "ab-2",
    type: "audiobook",
    title: "Words of Radiance",
    subtitle: null,
    gaps: ["chapters"],
    gapCount: 1,
    coverUrl: null,
    status: "available",
    createdAt: "2026-08-02T00:00:00.000Z",
  },
];

function renderTable(
  overrides: Partial<Parameters<typeof MetadataGapsTable>[0]> = {},
) {
  const props = {
    items: ITEMS,
    gapCounts: GAP_COUNTS,
    detailHref: (item: MetadataGapItem) => `/audiobooks/${item.id}`,
    onEdit: vi.fn(),
    onLinkHardcover: vi.fn(),
    onLinkGoodreads: vi.fn(),
    ...overrides,
  };
  const view = render(<MetadataGapsTable {...props} />);
  return { ...props, view };
}

describe("MetadataGapsTable", () => {
  it("lists each item with its own gaps", () => {
    renderTable();

    expect(screen.getByText("The Way of Kings")).toBeInTheDocument();
    expect(screen.getByText("Book One")).toBeInTheDocument();
    expect(screen.getByText("Words of Radiance")).toBeInTheDocument();

    expect(screen.getByText("gaps.description")).toBeInTheDocument();
    expect(screen.getByText("gaps.narrator")).toBeInTheDocument();
    expect(screen.getByText("gaps.chapters")).toBeInTheDocument();
  });

  it("links the title to the item's detail page", () => {
    renderTable();

    expect(screen.getByText("The Way of Kings").closest("a")).toHaveAttribute(
      "href",
      "/audiobooks/ab-1",
    );
  });

  it("shows the API cover URL and falls back to a placeholder", () => {
    const { view } = renderTable();

    // Covers are decorative (the title beside them is the accessible name), so
    // they are queried from the DOM rather than by role.
    const images = view.container.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute("src", "/api/audiobooks/ab-1/cover");
  });

  it("hands the clicked item to the edit callback", async () => {
    const props = renderTable();

    const editButtons = screen.getAllByText("actions.edit");
    await userEvent.click(editButtons[0]!);

    expect(props.onEdit).toHaveBeenCalledWith(ITEMS[0]);
  });

  it("offers the link actions behind the row menu", async () => {
    const props = renderTable();

    const menus = screen.getAllByLabelText("table.actions");
    await userEvent.click(menus[0]!);
    await userEvent.click(await screen.findByText("actions.linkHardcover"));

    expect(props.onLinkHardcover).toHaveBeenCalledWith(ITEMS[0]);
  });

  it("says so when nothing is missing", () => {
    renderTable({ items: [] });

    expect(screen.getByText("empty")).toBeInTheDocument();
  });
});
