import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent, waitFor } from "../../../__test-utils__/render";
import { EditAudiobookDialog } from "../edit-audiobook-dialog";
import type { AudiobookDetail } from "../../../lib/use-audiobooks";

const { mockUpdateAudiobook, mockToast } = vi.hoisted(() => ({
  mockUpdateAudiobook: {
    mutateAsync: vi.fn(),
    isPending: false,
  },
  mockToast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("../../../lib/use-audiobooks", () => ({
  useAudiobook: () => ({ data: null }),
  useUpdateAudiobook: () => mockUpdateAudiobook,
  useAuthors: () => ({ data: [] }),
  useNarrators: () => ({ data: [] }),
  usePublishers: () => ({ data: [] }),
  useGenres: () => ({ data: [] }),
}));

vi.mock("../../../lib/use-tags", () => ({
  useTags: () => ({ data: [] }),
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

// Mock complex UI components that don't work well in jsdom
vi.mock("@repo/ui/components/ui/creatable-combobox", () => ({
  CreatableCombobox: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="creatable-combobox">{placeholder}</div>
  ),
}));

vi.mock("@repo/ui/components/ui/creatable-select", () => ({
  CreatableSelect: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="creatable-select">{placeholder}</div>
  ),
}));

vi.mock("@repo/ui/components/ui/rich-text-editor", () => ({
  RichTextEditor: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="rich-text-editor">{placeholder}</div>
  ),
}));

vi.mock("../../shared/series-entry-editor", () => ({
  SeriesEntryEditor: () => <div data-testid="series-entry-editor" />,
}));

function buildAudiobookDetail(
  overrides: Partial<AudiobookDetail> = {}
): AudiobookDetail {
  return {
    id: "ab-1",
    title: "Test Audiobook",
    subtitle: "A Subtitle",
    description: "A description",
    authors: [{ id: "a1", name: "Author One" }],
    narrators: [{ id: "n1", name: "Narrator One" }],
    genres: [{ id: "g1", name: "Fiction" }],
    tags: [{ id: "t1", name: "favorite" }],
    series: [],
    publisher: "Test Publisher",
    language: "en",
    publishedDate: "2023-01-01",
    isbn: "978-0000000000",
    asin: "B000000000",
    coverUrl: null,
    duration: 36000,
    size: 500000000,
    addedAt: "2023-01-01T00:00:00Z",
    libraryId: "lib-1",
    ...overrides,
  } as AudiobookDetail;
}

describe("EditAudiobookDialog", () => {
  const mockOnOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateAudiobook.mutateAsync.mockResolvedValue({});
    mockUpdateAudiobook.isPending = false;
  });

  it("does not render dialog content when closed", () => {
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={false}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.queryByLabelText("fields.title")).not.toBeInTheDocument();
  });

  it("renders dialog with form fields when open", () => {
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByLabelText("fields.title")).toBeInTheDocument();
    expect(screen.getByLabelText("fields.subtitle")).toBeInTheDocument();
    expect(screen.getByLabelText("fields.publishedYear")).toBeInTheDocument();
    expect(screen.getByLabelText("fields.isbn")).toBeInTheDocument();
    expect(screen.getByLabelText("fields.asin")).toBeInTheDocument();
  });

  it("populates form fields from audiobook data", () => {
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByLabelText("fields.title")).toHaveValue("Test Audiobook");
    expect(screen.getByLabelText("fields.subtitle")).toHaveValue("A Subtitle");
    expect(screen.getByLabelText("fields.isbn")).toHaveValue(
      "978-0000000000"
    );
    expect(screen.getByLabelText("fields.asin")).toHaveValue("B000000000");
  });

  it("renders cancel, save, and save-and-close buttons", () => {
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    expect(screen.getByText("cancel")).toBeInTheDocument();
    expect(screen.getByText("save")).toBeInTheDocument();
    expect(screen.getByText("saveAndClose")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    await user.click(screen.getByText("cancel"));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not call mutateAsync when nothing changed (save and close)", async () => {
    const user = userEvent.setup();
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    await user.click(screen.getByText("saveAndClose"));

    expect(mockUpdateAudiobook.mutateAsync).not.toHaveBeenCalled();
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls mutateAsync with changed title on submit", async () => {
    const user = userEvent.setup();
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const titleInput = screen.getByLabelText("fields.title");
    await user.clear(titleInput);
    await user.type(titleInput, "New Title");
    await user.click(screen.getByText("saveAndClose"));

    await waitFor(() => {
      expect(mockUpdateAudiobook.mutateAsync).toHaveBeenCalledWith({
        id: "ab-1",
        data: expect.objectContaining({ title: "New Title" }),
      });
    });
  });

  it("shows success toast after successful save", async () => {
    const user = userEvent.setup();
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const titleInput = screen.getByLabelText("fields.title");
    await user.clear(titleInput);
    await user.type(titleInput, "Changed");
    await user.click(screen.getByText("saveAndClose"));

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith("success");
    });
  });

  it("shows error toast on save failure", async () => {
    mockUpdateAudiobook.mutateAsync.mockRejectedValue(new Error("fail"));

    const user = userEvent.setup();
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const titleInput = screen.getByLabelText("fields.title");
    await user.clear(titleInput);
    await user.type(titleInput, "Changed");
    await user.click(screen.getByText("saveAndClose"));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("error");
    });
  });

  it("shows navigation buttons when audiobookIds are provided", () => {
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
        audiobookIds={["ab-0", "ab-1", "ab-2"]}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByTitle("previous")).toBeInTheDocument();
    expect(screen.getByTitle("next")).toBeInTheDocument();
  });

  it("calls onNavigate when navigation buttons are clicked", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
        audiobookIds={["ab-0", "ab-1", "ab-2"]}
        onNavigate={onNavigate}
      />
    );

    await user.click(screen.getByTitle("next"));
    expect(onNavigate).toHaveBeenCalledWith("ab-2");

    await user.click(screen.getByTitle("previous"));
    expect(onNavigate).toHaveBeenCalledWith("ab-0");
  });

  it("save button (without close) does not close dialog", async () => {
    const user = userEvent.setup();
    render(
      <EditAudiobookDialog
        audiobook={buildAudiobookDetail()}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    );

    const titleInput = screen.getByLabelText("fields.title");
    await user.clear(titleInput);
    await user.type(titleInput, "Changed");
    await user.click(screen.getByText("save"));

    await waitFor(() => {
      expect(mockUpdateAudiobook.mutateAsync).toHaveBeenCalled();
    });
    // onOpenChange should NOT be called with false for "save" (only "saveAndClose")
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });
});
