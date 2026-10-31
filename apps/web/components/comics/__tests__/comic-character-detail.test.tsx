import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "../../../__test-utils__/render";
import { ComicCharacterDetail } from "../comic-character-detail";
import type { ComicCharacterDetail as Detail } from "../../../lib/use-comic-characters";

const { characterQuery } = vi.hoisted(() => ({
  characterQuery: {
    data: undefined as unknown,
    isLoading: false,
    error: null as Error | null,
  },
}));

vi.mock("../../../lib/use-comic-characters", () => ({
  useComicCharacter: () => characterQuery,
}));
// The grids have their own tests; here they only list what they were given.
vi.mock("../comic-series-grid", () => ({
  ComicSeriesGrid: ({ series }: { series: { title: string }[] }) => (
    <ul>
      {series.map((s) => (
        <li key={s.title}>{s.title}</li>
      ))}
    </ul>
  ),
}));
vi.mock("../comic-collection-grid", () => ({
  ComicCollectionGrid: ({
    collections,
  }: {
    collections: { name: string }[];
  }) => (
    <ul>
      {collections.map((c) => (
        <li key={c.name}>{c.name}</li>
      ))}
    </ul>
  ),
}));

const seriesItem = (title: string) =>
  ({
    id: title,
    title,
    mainCharacters: [],
  }) as unknown as Detail["soloSeries"][number];

function section(name: string) {
  return screen.getByRole("heading", { name }).closest("section")!;
}

describe("ComicCharacterDetail", () => {
  beforeEach(() => {
    characterQuery.isLoading = false;
    characterQuery.error = null;
  });

  it("shows solo series, team-ups and collections in their own sections", () => {
    characterQuery.data = {
      id: "logan",
      name: "Wolverine",
      soloSeries: [
        seriesItem("Wolverine (1988)"),
        seriesItem("Wolverine (2003)"),
      ],
      teamUps: [seriesItem("Wolverine & Captain America (2004)")],
      collections: [
        {
          id: "c1",
          name: "Wolverine solo series",
          seriesCount: 2,
          coverUrl: null,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    } satisfies Partial<Detail>;

    render(<ComicCharacterDetail id="logan" />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Wolverine" }),
    ).toBeInTheDocument();
    expect(
      within(section("characters.solo"))
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Wolverine (1988)", "Wolverine (2003)"]);
    expect(
      within(section("characters.teamUps")).getByText(
        "Wolverine & Captain America (2004)",
      ),
    ).toBeInTheDocument();
    expect(
      within(section("characters.collections")).getByText(
        "Wolverine solo series",
      ),
    ).toBeInTheDocument();
  });

  it("leaves out empty sections", () => {
    characterQuery.data = {
      id: "rogue",
      name: "Rogue",
      soloSeries: [seriesItem("Rogue (1995)")],
      teamUps: [],
      collections: [],
    } satisfies Partial<Detail>;

    render(<ComicCharacterDetail id="rogue" />);

    expect(
      screen.getByRole("heading", { name: "characters.solo" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "characters.teamUps" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "characters.collections" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("characters.noSeries")).not.toBeInTheDocument();
  });

  it("says so when no series are left to show", () => {
    characterQuery.data = {
      id: "gambit",
      name: "Gambit",
      soloSeries: [],
      teamUps: [],
      collections: [],
    } satisfies Partial<Detail>;

    render(<ComicCharacterDetail id="gambit" />);

    expect(screen.getByText("characters.noSeries")).toBeInTheDocument();
  });

  it("shows an error with a way back when loading fails", () => {
    characterQuery.data = undefined;
    characterQuery.error = new Error("nope");

    render(<ComicCharacterDetail id="missing" />);

    expect(screen.getByText("characters.error")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/comics?view=characters",
    );
  });
});
