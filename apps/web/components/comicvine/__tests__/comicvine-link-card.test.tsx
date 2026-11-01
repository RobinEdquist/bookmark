import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../../__test-utils__/render";
import { ComicvineLinkCard } from "../comicvine-link-card";
import type {
  ComicvineBookLink,
  ComicvineSeriesLink,
} from "../../../lib/use-comicvine";

const { links } = vi.hoisted(() => ({
  links: {
    series: null as ComicvineSeriesLink | null,
    book: null as ComicvineBookLink | null,
  },
}));

vi.mock("../../../lib/use-comicvine", () => ({
  useComicvineSeriesLink: () => ({ link: links.series, isLoading: false }),
  useComicvineBookLink: () => ({
    data: { link: links.book },
    isLoading: false,
  }),
  useUnlinkSeries: () => ({ unlinkSeries: vi.fn(), isUnlinking: false }),
  useUnlinkBook: () => ({ unlinkBook: vi.fn(), isUnlinking: false }),
}));
vi.mock("../../../lib/use-comics", () => ({
  useComicBook: () => ({ data: undefined }),
  useUpdateComicBook: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// Shortened from ComicVine's description of Sex Criminals (2013).
const CV_DESCRIPTION =
  '<p>Writer <a href="//www.comicvine.com/matt-fraction/4040-42266/" data-ref-id="4040-42266">Matt Fraction</a> and artist <a href="//www.comicvine.com/chip-zdarsky/4040-56003/" data-ref-id="4040-56003">Chip Zdarsky\'s</a> comedy series.</p><h4>Companion Series</h4><ul><li><a href="/just-the-tips/4050-78556/" data-ref-id="4050-78556">Just the Tips</a></li></ul>';
const CV_TEXT =
  "Writer Matt Fraction and artist Chip Zdarsky's comedy series. Companion Series Just the Tips";

const timestamps = {
  syncedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("ComicvineLinkCard", () => {
  it("shows a series description as text, not markup", () => {
    links.series = {
      id: "v1",
      comicvineVolumeId: 66221,
      name: "Sex Criminals",
      startYear: 2013,
      publisherName: "Image",
      countOfIssues: 31,
      description: CV_DESCRIPTION,
      imageUrl: null,
      siteDetailUrl: null,
      ...timestamps,
    };

    render(<ComicvineLinkCard level="series" entityId="s1" />);

    expect(screen.getByText(CV_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/<p>|data-ref-id/)).not.toBeInTheDocument();
  });

  it("shows an issue description as text, not markup", () => {
    links.book = {
      id: "i1",
      comicvineIssueId: 420000,
      comicvineVolumeId: 66221,
      issueNumber: "1",
      name: "One Weird Trick",
      coverDate: "2013-11-30",
      storeDate: null,
      description: CV_DESCRIPTION,
      imageUrl: null,
      siteDetailUrl: null,
      personCredits: [],
      characterCredits: [],
      storyArcCredits: [],
      ...timestamps,
    };

    render(<ComicvineLinkCard level="book" entityId="b1" />);

    expect(screen.getByText(CV_TEXT)).toBeInTheDocument();
    expect(screen.queryByText(/<p>|data-ref-id/)).not.toBeInTheDocument();
  });
});
