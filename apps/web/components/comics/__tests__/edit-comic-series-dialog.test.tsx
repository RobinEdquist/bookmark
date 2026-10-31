import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "../../../__test-utils__/render";
import { EditComicSeriesDialog } from "../edit-comic-series-dialog";
import type { ComicSeriesDetail } from "../../../lib/use-comics";

const { mockUpdateSeries } = vi.hoisted(() => ({
  mockUpdateSeries: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock("../../../lib/use-comics", () => ({
  useComicSeriesDetail: () => ({ data: undefined }),
  useUpdateComicSeries: () => mockUpdateSeries,
  useComicPublishers: () => ({ data: [] }),
  useComicGenres: () => ({ data: [] }),
}));
vi.mock("../../../lib/use-tags", () => ({ useTags: () => ({ data: [] }) }));
vi.mock("../../../lib/use-comic-characters", () => ({
  useComicCharacterSuggestions: () => ({
    data: { characters: [{ id: "c-rogue", name: "Rogue" }], total: 1 },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Stand-ins for widgets that need a real layout engine. The combobox stand-in
// is a comma-separated text field so a test can read and set the chips.
vi.mock("@repo/ui/components/ui/creatable-combobox", () => ({
  CreatableCombobox: ({
    placeholder,
    value,
    onChange,
    options,
    maxItems,
  }: {
    placeholder: string;
    value: string[];
    onChange: (v: string[]) => void;
    options: { value: string }[];
    maxItems?: number;
  }) => (
    <input
      aria-label={placeholder}
      data-max-items={maxItems}
      data-options={options.map((o) => o.value).join(",")}
      value={value.join(",")}
      onChange={(e) => onChange(e.target.value.split(",").filter(Boolean))}
    />
  ),
}));
vi.mock("@repo/ui/components/ui/creatable-select", () => ({
  CreatableSelect: () => null,
}));
vi.mock("@repo/ui/components/ui/rich-text-editor", () => ({
  RichTextEditor: () => null,
}));

const series: ComicSeriesDetail = {
  id: "series-1",
  title: "Wolverine & Captain America",
  sortTitle: null,
  description: null,
  publisher: "Marvel",
  imprint: null,
  startYear: 2004,
  totalIssueCount: null,
  language: null,
  ageRating: null,
  status: "available",
  manualFields: [],
  coverUrl: null,
  genres: [],
  tags: [],
  mainCharacters: [
    { id: "c-logan", name: "Wolverine" },
    { id: "c-cap", name: "Captain America" },
  ],
  creators: [],
  books: [],
  gaps: [],
  publishedTotal: null,
  unownedPublished: [],
  aggregatedTags: { storyArcs: [], characters: [] },
  collections: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  comicvine: {
    linked: false,
    volumeId: null,
    name: null,
    siteDetailUrl: null,
    imageUrl: null,
  },
};

const mainCharactersField = () =>
  screen.getByLabelText('fields.mainCharactersPlaceholder({"count":3})');

describe("EditComicSeriesDialog main characters", () => {
  beforeEach(() => {
    mockUpdateSeries.mutateAsync.mockReset().mockResolvedValue({
      success: true,
    });
  });

  it("shows the current main characters, offers suggestions and caps them at three", () => {
    render(
      <EditComicSeriesDialog series={series} open onOpenChange={vi.fn()} />,
    );
    const field = mainCharactersField();
    expect(field).toHaveValue("Wolverine,Captain America");
    expect(field).toHaveAttribute("data-max-items", "3");
    expect(field).toHaveAttribute("data-options", "Rogue");
  });

  it("sends the new list when it changes", async () => {
    const user = userEvent.setup();
    render(
      <EditComicSeriesDialog series={series} open onOpenChange={vi.fn()} />,
    );
    fireEvent.change(mainCharactersField(), {
      target: { value: "Wolverine,Rogue" },
    });
    await user.click(screen.getByRole("button", { name: "saveAndClose" }));

    await waitFor(() =>
      expect(mockUpdateSeries.mutateAsync).toHaveBeenCalledWith({
        id: "series-1",
        data: { mainCharacters: ["Wolverine", "Rogue"] },
      }),
    );
  });

  it("leaves them out when they did not change", async () => {
    const user = userEvent.setup();
    render(
      <EditComicSeriesDialog series={series} open onOpenChange={vi.fn()} />,
    );
    await user.clear(screen.getByLabelText("fields.title"));
    await user.type(screen.getByLabelText("fields.title"), "Wolverine (2004)");
    await user.click(screen.getByRole("button", { name: "saveAndClose" }));

    await waitFor(() =>
      expect(mockUpdateSeries.mutateAsync).toHaveBeenCalledWith({
        id: "series-1",
        data: { title: "Wolverine (2004)" },
      }),
    );
  });
});
