import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../../__test-utils__/render";
import { ComicCharactersView } from "../comic-characters-view";

const { infiniteQuery, lastFilters } = vi.hoisted(() => ({
  infiniteQuery: {
    data: undefined as unknown,
    isLoading: false,
    error: null as Error | null,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => Promise.resolve(),
  },
  lastFilters: { value: undefined as unknown },
}));

vi.mock("../../../lib/use-comic-characters", () => ({
  useInfiniteComicCharacters: (filters: unknown) => {
    lastFilters.value = filters;
    return infiniteQuery;
  },
}));

describe("ComicCharactersView", () => {
  it("lists characters with series counts, linking to their pages", () => {
    infiniteQuery.data = {
      pages: [
        {
          characters: [
            { id: "logan", name: "Wolverine", seriesCount: 5, coverUrl: null },
            { id: "rogue", name: "Rogue", seriesCount: 2, coverUrl: null },
          ],
          total: 2,
        },
      ],
    };

    render(<ComicCharactersView search="wol" animateEntrance={false} />);

    expect(lastFilters.value).toEqual({ search: "wol" });
    expect(
      screen.getByRole("heading", { name: "Wolverine" }).closest("a"),
    ).toHaveAttribute("href", "/comics/characters/logan");
    expect(
      screen.getByText('collections.seriesCount({"count":5})'),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Rogue" })).toBeInTheDocument();
  });

  it("shows an empty state when there are none", () => {
    infiniteQuery.data = { pages: [{ characters: [], total: 0 }] };

    render(<ComicCharactersView search="" />);

    expect(screen.getByText("characters.empty")).toBeInTheDocument();
  });
});
