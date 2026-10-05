import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { HiddenAudiobooksSection } from "../hidden-audiobooks-section";

const { mockUseHiddenAudiobooks, mockUseRestore, mockToast } = vi.hoisted(
  () => {
    const toast = Object.assign(vi.fn(), {
      success: vi.fn(),
      error: vi.fn(),
    });
    return {
      mockUseHiddenAudiobooks: vi.fn(),
      mockUseRestore: vi.fn(),
      mockToast: toast,
    };
  },
);

vi.mock("../../../lib/use-hidden-audiobooks", () => ({
  useHiddenAudiobooks: mockUseHiddenAudiobooks,
  useRestoreHiddenAudiobook: mockUseRestore,
}));

vi.mock("sonner", () => ({ toast: mockToast }));

const mutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRestore.mockReturnValue({
    mutate,
    isPending: false,
    variables: undefined,
  });
  mockUseHiddenAudiobooks.mockReturnValue({
    data: {
      items: [
        {
          id: "ab-1",
          title: "Skeleton Crew",
          folderPath: "Stephen King/Skeleton Crew",
        },
        { id: "ab-2", title: "Loose File", folderPath: null },
      ],
    },
  });
});

async function openSection() {
  const user = userEvent.setup();
  render(<HiddenAudiobooksSection />);
  await user.click(screen.getByRole("button", { name: /title/ }));
  return user;
}

describe("HiddenAudiobooksSection", () => {
  it("renders nothing when no audiobooks are hidden", () => {
    mockUseHiddenAudiobooks.mockReturnValue({ data: { items: [] } });

    const { container } = render(<HiddenAudiobooksSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while the list is loading", () => {
    mockUseHiddenAudiobooks.mockReturnValue({
      data: undefined,
      isError: false,
    });

    const { container } = render(<HiddenAudiobooksSection />);

    expect(container).toBeEmptyDOMElement();
  });

  it("says the list failed to load and offers a retry, instead of looking empty", async () => {
    const refetch = vi.fn();
    mockUseHiddenAudiobooks.mockReturnValue({
      data: undefined,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();

    render(<HiddenAudiobooksSection />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
    await user.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("lists hidden audiobooks with their folder, or a root-file label", async () => {
    await openSection();

    expect(screen.getByText("Skeleton Crew")).toBeInTheDocument();
    expect(screen.getByText("Stephen King/Skeleton Crew")).toBeInTheDocument();
    expect(screen.getByText("Loose File")).toBeInTheDocument();
    expect(screen.getByText("rootFile")).toBeInTheDocument();
  });

  it("restores the chosen audiobook and confirms it", async () => {
    mutate.mockImplementation((_id, { onSuccess }) =>
      onSuccess({ outcome: "restored" }),
    );
    const user = await openSection();

    await user.click(screen.getAllByRole("button", { name: /restore/ })[0]!);

    expect(mutate).toHaveBeenCalledWith("ab-1", expect.any(Object));
    expect(mockToast.success).toHaveBeenCalledWith(
      'toast.restored({"title":"Skeleton Crew"})',
    );
  });

  it("explains when the files were gone and the record was removed", async () => {
    mutate.mockImplementation((_id, { onSuccess }) =>
      onSuccess({ outcome: "removed" }),
    );
    const user = await openSection();

    await user.click(screen.getAllByRole("button", { name: /restore/ })[1]!);

    expect(mutate).toHaveBeenCalledWith("ab-2", expect.any(Object));
    expect(mockToast).toHaveBeenCalledWith(
      'toast.removed({"title":"Loose File"})',
    );
    expect(mockToast.success).not.toHaveBeenCalled();
  });

  it("disables every restore button while one restore runs", async () => {
    mockUseRestore.mockReturnValue({
      mutate,
      isPending: true,
      variables: "ab-1",
    });
    await openSection();

    expect(screen.getByRole("button", { name: /restoring/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^restore$/ })).toBeDisabled();
  });
});
