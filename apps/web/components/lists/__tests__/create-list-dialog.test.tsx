import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "../../../__test-utils__/render";
import { CreateListDialog } from "../create-list-dialog";

// --- Hoisted mocks ---

const { mockUseCreateList, mockUseAddToList, mockToast } = vi.hoisted(() => ({
  mockUseCreateList: vi.fn(),
  mockUseAddToList: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../../../lib/use-lists", () => ({
  useCreateList: mockUseCreateList,
  useAddToList: mockUseAddToList,
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

// --- Pointer event polyfill for Radix ---
beforeEach(() => {
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

// --- Helpers ---

function renderDialog(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialItem?: { itemType: "audiobook" | "ebook"; itemId: string };
} = {}) {
  const onOpenChange = props.onOpenChange ?? vi.fn();
  const result = render(
    <CreateListDialog
      open={props.open ?? true}
      onOpenChange={onOpenChange}
      initialItem={props.initialItem}
    />
  );
  return { ...result, onOpenChange };
}

// --- Tests ---

describe("CreateListDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCreateList.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ id: "new-list-1", name: "Test" }),
      isPending: false,
    });
    mockUseAddToList.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    });
  });

  it("renders the dialog title when open", () => {
    renderDialog();
    expect(screen.getByText("title")).toBeInTheDocument();
  });

  it("does not render dialog content when closed", () => {
    renderDialog({ open: false });
    expect(screen.queryByText("title")).not.toBeInTheDocument();
  });

  it("renders name input and visibility options", () => {
    renderDialog();
    expect(screen.getByLabelText("name")).toBeInTheDocument();
    expect(screen.getByText("private")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
  });

  it("renders cancel and create buttons", () => {
    renderDialog();
    expect(screen.getByText("cancel")).toBeInTheDocument();
    expect(screen.getByText("create")).toBeInTheDocument();
  });

  it("disables create button when name is empty", () => {
    renderDialog();
    const createBtn = screen.getByText("create").closest("button")!;
    expect(createBtn).toBeDisabled();
  });

  it("enables create button when name is entered", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("name"), "My List");

    const createBtn = screen.getByText("create").closest("button")!;
    expect(createBtn).toBeEnabled();
  });

  it("calls createList on form submit with name and visibility", async () => {
    const createListFn = vi.fn().mockResolvedValue({ id: "new-1", name: "My List" });
    mockUseCreateList.mockReturnValue({ mutateAsync: createListFn, isPending: false });
    const onOpenChange = vi.fn();

    const user = userEvent.setup();
    renderDialog({ onOpenChange });

    await user.type(screen.getByLabelText("name"), "My List");
    await user.click(screen.getByText("create"));

    await waitFor(() => {
      expect(createListFn).toHaveBeenCalledWith({
        name: "My List",
        isPublic: false,
      });
    });
  });

  it("adds initial item to created list when initialItem is provided", async () => {
    const createListFn = vi.fn().mockResolvedValue({ id: "new-1", name: "My List" });
    const addToListFn = vi.fn().mockResolvedValue({});
    mockUseCreateList.mockReturnValue({ mutateAsync: createListFn, isPending: false });
    mockUseAddToList.mockReturnValue({ mutateAsync: addToListFn, isPending: false });

    const user = userEvent.setup();
    renderDialog({ initialItem: { itemType: "audiobook", itemId: "ab-1" } });

    await user.type(screen.getByLabelText("name"), "My List");
    await user.click(screen.getByText("create"));

    await waitFor(() => {
      expect(addToListFn).toHaveBeenCalledWith({
        listId: "new-1",
        itemType: "audiobook",
        itemId: "ab-1",
      });
    });
  });

  it("shows toast error when create fails", async () => {
    const createListFn = vi.fn().mockRejectedValue(new Error("fail"));
    mockUseCreateList.mockReturnValue({ mutateAsync: createListFn, isPending: false });

    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("name"), "My List");
    await user.click(screen.getByText("create"));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("error");
    });
  });

  it("shows creating text when isPending", () => {
    mockUseCreateList.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    });
    renderDialog();
    expect(screen.getByText("creating")).toBeInTheDocument();
  });
});
