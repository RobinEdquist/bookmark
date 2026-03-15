import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "../../../__test-utils__/render";
import { SortSelect } from "../sort-select";
import type { SortField, SortOrder } from "../../../lib/use-sort-preference";

// Radix DropdownMenu uses pointer-down events; we need to mock pointer events
beforeEach(() => {
  // jsdom doesn't support PointerEvent, so we polyfill it
  class Pointer extends MouseEvent {
    pointerId: number;
    constructor(type: string, init?: PointerEventInit & { pointerId?: number }) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).PointerEvent = Pointer;

  // Stub Element.prototype methods Radix uses
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

function renderSortSelect(overrides: Partial<{
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
}> = {}) {
  const props = {
    sortBy: "title" as SortField,
    sortOrder: "asc" as SortOrder,
    onSortChange: vi.fn(),
    ...overrides,
  };
  const result = render(<SortSelect {...props} />);
  return { ...result, onSortChange: props.onSortChange };
}

describe("SortSelect", () => {
  it("renders the trigger button", () => {
    renderSortSelect();
    // The trigger button should show the current sort field label
    // With mocked useTranslations, t("title") returns "title"
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("displays the current sort field label on the trigger", () => {
    renderSortSelect({ sortBy: "title" });
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("displays the label text on trigger", () => {
    renderSortSelect({ sortBy: "createdAt" });
    // t("dateAdded") returns "dateAdded"
    expect(screen.getByText("dateAdded")).toBeInTheDocument();
  });

  it("shows sort options when trigger is clicked", async () => {
    const user = userEvent.setup();
    renderSortSelect({ sortBy: "title" });

    await user.click(screen.getByRole("button"));

    // All 5 sort options should appear as menuitems
    await waitFor(() => {
      expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    });
  });

  it("renders all five sort option labels in the menu", async () => {
    const user = userEvent.setup();
    renderSortSelect({ sortBy: "createdAt" });

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      const menuItems = screen.getAllByRole("menuitem");
      expect(menuItems).toHaveLength(5);
      // Check each menu item contains the expected label text
      // The active item includes the direction label (e.g., "dateAddedoldest")
      const labels = menuItems.map((item) => item.textContent ?? "");
      expect(labels.some((l) => l.includes("title"))).toBe(true);
      expect(labels.some((l) => l.includes("dateAdded"))).toBe(true);
      expect(labels.some((l) => l.includes("author"))).toBe(true);
      expect(labels.some((l) => l.includes("rating"))).toBe(true);
      expect(labels.some((l) => l.includes("series"))).toBe(true);
    });
  });

  it("shows direction label for the active sort field", async () => {
    const user = userEvent.setup();
    // sortBy=title, sortOrder=asc -> getDirectionLabel returns t("asc") = "asc"
    renderSortSelect({ sortBy: "title", sortOrder: "asc" });

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("asc")).toBeInTheDocument();
    });
  });

  it("shows direction label for createdAt as newest/oldest", async () => {
    const user = userEvent.setup();
    renderSortSelect({ sortBy: "createdAt", sortOrder: "desc" });

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      // createdAt + desc -> t("newest") = "newest"
      expect(screen.getByText("newest")).toBeInTheDocument();
    });
  });

  it("calls onSortChange when an option is clicked", async () => {
    const user = userEvent.setup();
    const { onSortChange } = renderSortSelect({ sortBy: "title" });

    await user.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getAllByRole("menuitem")).toHaveLength(5);
    });

    // Click "author" option
    await user.click(screen.getByText("author"));

    expect(onSortChange).toHaveBeenCalledWith("author");
  });
});
