import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "../../../__test-utils__/render";
import { BookmarkForm } from "../bookmark-form";

// --- Hoisted mocks ---

const { mockUseCreateBookmark, mockGenerateBookmarkId, mockToast } = vi.hoisted(
  () => ({
    mockUseCreateBookmark: vi.fn(),
    mockGenerateBookmarkId: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
  }),
);

vi.mock("../../../lib/use-bookmarks", () => ({
  useCreateBookmark: mockUseCreateBookmark,
  generateBookmarkId: mockGenerateBookmarkId,
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

// --- Helpers ---

function createMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(
      (
        _vars: unknown,
        opts?: { onSuccess?: () => void; onError?: () => void },
      ) => {
        opts?.onSuccess?.();
      },
    ),
    isPending: false,
    ...overrides,
  };
}

const timestampInput = () => screen.getByLabelText("label");
const saveButton = () => screen.getByRole("button", { name: "bookmarkSave" });

function renderForm(props: Partial<Parameters<typeof BookmarkForm>[0]> = {}) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <BookmarkForm
      audiobookId="book-1"
      initialPosition={754}
      duration={3600}
      onSaved={onSaved}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onSaved, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCreateBookmark.mockReturnValue(createMutation());
  mockGenerateBookmarkId.mockReturnValue("client-uuid-1");
});

describe("BookmarkForm", () => {
  it("shows the captured position as a formatted timestamp", () => {
    renderForm();

    expect(timestampInput()).toHaveValue("12:34");
  });

  it("adjusts the timestamp with the ±5s steppers without touching playback", async () => {
    renderForm();

    await userEvent.click(
      screen.getByRole("button", { name: 'subtractSeconds({"seconds":5})' }),
    );
    expect(timestampInput()).toHaveValue("12:29");

    await userEvent.click(
      screen.getByRole("button", { name: 'addSeconds({"seconds":5})' }),
    );
    expect(timestampInput()).toHaveValue("12:34");
  });

  it("clamps stepping at zero", async () => {
    renderForm({ initialPosition: 2 });

    await userEvent.click(
      screen.getByRole("button", { name: 'subtractSeconds({"seconds":5})' }),
    );

    expect(timestampInput()).toHaveValue("0:00");
  });

  it("clamps stepping at the audiobook duration", async () => {
    renderForm({ initialPosition: 3598, duration: 3600 });

    await userEvent.click(
      screen.getByRole("button", { name: 'addSeconds({"seconds":5})' }),
    );

    expect(timestampInput()).toHaveValue("1:00:00");
  });

  it("disables save and shows an error for unparseable input", async () => {
    renderForm();

    await userEvent.clear(timestampInput());
    await userEvent.type(timestampInput(), "abc");

    expect(screen.getByRole("alert")).toHaveTextContent("invalid");
    expect(saveButton()).toBeDisabled();
  });

  it("disables save when the timestamp is past the end of the book", async () => {
    renderForm({ duration: 3600 });

    await userEvent.clear(timestampInput());
    await userEvent.type(timestampInput(), "2:00:00");

    expect(screen.getByRole("alert")).toHaveTextContent("beyondEnd");
    expect(saveButton()).toBeDisabled();
  });

  it("creates the bookmark with trimmed note and an idempotency id", async () => {
    const mutation = createMutation();
    mockUseCreateBookmark.mockReturnValue(mutation);
    const { onSaved } = renderForm();

    await userEvent.type(
      screen.getByLabelText("bookmarkNote"),
      "  The lighthouse scene  ",
    );
    await userEvent.click(saveButton());

    expect(mutation.mutate).toHaveBeenCalledWith(
      {
        audiobookId: "book-1",
        position: 754,
        note: "The lighthouse scene",
        id: "client-uuid-1",
      },
      expect.anything(),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(mockToast.success).toHaveBeenCalledWith("bookmarkSaved");
  });

  it("omits the note entirely when left empty", async () => {
    const mutation = createMutation();
    mockUseCreateBookmark.mockReturnValue(mutation);
    renderForm();

    await userEvent.click(saveButton());

    expect(mutation.mutate).toHaveBeenCalledWith(
      {
        audiobookId: "book-1",
        position: 754,
        id: "client-uuid-1",
      },
      expect.anything(),
    );
  });

  it("omits the idempotency id when crypto.randomUUID is unavailable", async () => {
    mockGenerateBookmarkId.mockReturnValue(undefined);
    const mutation = createMutation();
    mockUseCreateBookmark.mockReturnValue(mutation);
    renderForm();

    await userEvent.click(saveButton());

    expect(mutation.mutate).toHaveBeenCalledWith(
      { audiobookId: "book-1", position: 754 },
      expect.anything(),
    );
  });

  it("saves the adjusted timestamp, not the captured one", async () => {
    const mutation = createMutation();
    mockUseCreateBookmark.mockReturnValue(mutation);
    renderForm();

    await userEvent.clear(timestampInput());
    await userEvent.type(timestampInput(), "1:00:00");
    await userEvent.click(saveButton());

    expect(mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ position: 3600 }),
      expect.anything(),
    );
  });

  it("calls onCancel from the cancel button", async () => {
    const { onCancel } = renderForm();

    await userEvent.click(screen.getByRole("button", { name: "cancel" }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("surfaces failures with an error toast and keeps the form open", async () => {
    const mutation = createMutation({
      mutate: vi.fn(
        (
          _vars: unknown,
          opts?: { onSuccess?: () => void; onError?: () => void },
        ) => {
          opts?.onError?.();
        },
      ),
    });
    mockUseCreateBookmark.mockReturnValue(mutation);
    const { onSaved } = renderForm();

    await userEvent.click(saveButton());

    expect(mockToast.error).toHaveBeenCalledWith("bookmarkSaveError");
    expect(onSaved).not.toHaveBeenCalled();
  });
});
