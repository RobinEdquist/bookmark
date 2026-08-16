import { describe, it, expect, vi } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { GapFilterChips } from "../gap-filter-chips";
import type { MetadataGapCount } from "../../../lib/use-metadata-gaps";

// next-intl is mocked globally to echo the key, so chips read as "gaps.<key>".
const GAPS: MetadataGapCount[] = [
  { key: "description", count: 12, category: "essentials" },
  { key: "narrator", count: 30, category: "audio" },
  { key: "chapters", count: 3, category: "audio" },
  { key: "language", count: 0, category: "publication" },
  { key: "hardcoverLink", count: 5, category: "matches" },
  { key: "goodreadsLink", count: 9, category: "matches" },
];

describe("GapFilterChips", () => {
  it("groups gaps by what kind of data they are", () => {
    render(<GapFilterChips gaps={GAPS} selected={[]} onToggle={vi.fn()} />);

    expect(screen.getByText("categories.essentials")).toBeInTheDocument();
    expect(screen.getByText("categories.audio")).toBeInTheDocument();
    expect(screen.getByText("categories.matches")).toBeInTheDocument();

    // `language` is the only publication gap here and its count is 0.
    expect(
      screen.queryByText("categories.publication"),
    ).not.toBeInTheDocument();
  });

  it("gives each external source its own chip", () => {
    render(<GapFilterChips gaps={GAPS} selected={[]} onToggle={vi.fn()} />);

    expect(screen.getByText("gaps.hardcoverLink")).toBeInTheDocument();
    expect(screen.getByText("gaps.goodreadsLink")).toBeInTheDocument();
  });

  it("shows each gap with its count", () => {
    render(<GapFilterChips gaps={GAPS} selected={[]} onToggle={vi.fn()} />);

    expect(screen.getByText("gaps.description")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("gaps.narrator")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("hides gaps that nothing is missing", () => {
    render(<GapFilterChips gaps={GAPS} selected={[]} onToggle={vi.fn()} />);

    expect(screen.queryByText("gaps.language")).not.toBeInTheDocument();
  });

  it("keeps an empty gap visible while it is the active filter", () => {
    // Otherwise the chip you just clicked disappears the moment it filters the
    // list down to nothing, and there is no way to click it off again.
    render(
      <GapFilterChips gaps={GAPS} selected={["language"]} onToggle={vi.fn()} />,
    );

    expect(screen.getByText("gaps.language")).toBeInTheDocument();
  });

  it("marks selected chips as pressed", () => {
    render(
      <GapFilterChips
        gaps={GAPS}
        selected={["description"]}
        onToggle={vi.fn()}
      />,
    );

    const selected = screen.getByText("gaps.description").closest("button");
    const other = screen.getByText("gaps.narrator").closest("button");

    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(other).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the gap key when a chip is clicked", async () => {
    const onToggle = vi.fn();
    render(<GapFilterChips gaps={GAPS} selected={[]} onToggle={onToggle} />);

    await userEvent.click(screen.getByText("gaps.chapters"));

    expect(onToggle).toHaveBeenCalledWith("chapters");
  });

  it("renders nothing for a group with no gaps left", () => {
    render(
      <GapFilterChips
        gaps={[{ key: "description", count: 4, category: "essentials" }]}
        selected={[]}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText("categories.essentials")).toBeInTheDocument();
    expect(screen.queryByText("categories.audio")).not.toBeInTheDocument();
    expect(screen.queryByText("categories.matches")).not.toBeInTheDocument();
  });
});
