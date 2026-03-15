import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "../../../__test-utils__/render";
import { AddToListDialog } from "../add-to-list-dialog";

// --- Hoisted mocks ---

const { mockUseListsForItem, mockUseAddToList, mockUseRemoveFromList } = vi.hoisted(() => ({
  mockUseListsForItem: vi.fn(),
  mockUseAddToList: vi.fn(),
  mockUseRemoveFromList: vi.fn(),
}));

vi.mock("../../../lib/use-lists", () => ({
  useListsForItem: mockUseListsForItem,
  useAddToList: mockUseAddToList,
  useRemoveFromList: mockUseRemoveFromList,
  useCreateList: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
}));

// Mock CreateListDialog to avoid nested dialog complexity
vi.mock("../create-list-dialog", () => ({
  CreateListDialog: () => null,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// --- Polyfills for Radix ---
beforeEach(() => {
  // jsdom doesn't support ResizeObserver
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }

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

const mockLists = [
  { id: "list-1", name: "Favorites", isPublic: false, itemCount: 5, containsItem: true, listItemId: "li-1" },
  { id: "list-2", name: "To Read", isPublic: true, itemCount: 3, containsItem: false, listItemId: null },
  { id: "list-3", name: "Sci-Fi", isPublic: false, itemCount: 10, containsItem: false, listItemId: null },
];

function renderDialog(open = true) {
  const onOpenChange = vi.fn();
  const result = render(
    <AddToListDialog
      itemType="audiobook"
      itemId="ab-1"
      open={open}
      onOpenChange={onOpenChange}
    />
  );
  return { ...result, onOpenChange };
}

// --- Tests ---

describe("AddToListDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseListsForItem.mockReturnValue({ data: mockLists, isLoading: false });
    mockUseAddToList.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
    mockUseRemoveFromList.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined) });
  });

  it("renders the dialog title when open", () => {
    renderDialog();
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("does not render dialog content when closed", () => {
    renderDialog(false);
    expect(screen.queryByText("title")).not.toBeInTheDocument();
  });

  it("shows the list of available lists", () => {
    renderDialog();
    expect(screen.getByText("Favorites")).toBeInTheDocument();
    expect(screen.getByText("To Read")).toBeInTheDocument();
    expect(screen.getByText("Sci-Fi")).toBeInTheDocument();
  });

  it("shows item counts for each list", () => {
    renderDialog();
    expect(screen.getByText("(5)")).toBeInTheDocument();
    expect(screen.getByText("(3)")).toBeInTheDocument();
    expect(screen.getByText("(10)")).toBeInTheDocument();
  });

  it("shows loading spinner when lists are loading", () => {
    mockUseListsForItem.mockReturnValue({ data: undefined, isLoading: true });
    renderDialog();
    // The Loader2 icon is rendered as an svg with animate-spin class
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("shows empty state when no lists exist", () => {
    mockUseListsForItem.mockReturnValue({ data: [], isLoading: false });
    renderDialog();
    expect(screen.getByText("noLists")).toBeInTheDocument();
  });

  it("calls addToList when clicking an un-added list", async () => {
    const addToListFn = vi.fn().mockResolvedValue({});
    mockUseAddToList.mockReturnValue({ mutateAsync: addToListFn });

    const user = userEvent.setup();
    renderDialog();

    // Click "To Read" which is not in the list (containsItem: false)
    await user.click(screen.getByText("To Read"));

    await waitFor(() => {
      expect(addToListFn).toHaveBeenCalledWith({
        listId: "list-2",
        itemType: "audiobook",
        itemId: "ab-1",
      });
    });
  });

  it("calls removeFromList when clicking an already-added list", async () => {
    const removeFromListFn = vi.fn().mockResolvedValue(undefined);
    mockUseRemoveFromList.mockReturnValue({ mutateAsync: removeFromListFn });

    const user = userEvent.setup();
    renderDialog();

    // Click "Favorites" which is in the list (containsItem: true)
    await user.click(screen.getByText("Favorites"));

    await waitFor(() => {
      expect(removeFromListFn).toHaveBeenCalledWith({
        listId: "list-1",
        itemId: "li-1",
        itemType: "audiobook",
        mediaItemId: "ab-1",
      });
    });
  });

  it("renders the create new list button", () => {
    renderDialog();
    expect(screen.getByText("createNew")).toBeInTheDocument();
  });
});
