import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import {
  LibrarySetupOnboarding,
  WaitingForSetup,
} from "../library-setup-onboarding";

// --- Hoisted mocks ---

const { mockUseSettings, mockUpdateSettings } = vi.hoisted(() => ({
  mockUseSettings: vi.fn(),
  mockUpdateSettings: vi.fn(),
}));

vi.mock("../../../lib/use-settings", () => ({
  useSettings: mockUseSettings,
}));

// Stub the folder picker: render a single button that resolves a path so we can
// drive the "choose folder" flow without the filesystem-browse API.
vi.mock("../../settings/folder-picker-dialog", () => ({
  FolderPickerDialog: ({
    open,
    onSelect,
  }: {
    open: boolean;
    onSelect: (path: string) => void;
  }) =>
    open ? (
      <button onClick={() => onSelect("/picked/path")}>pick-folder</button>
    ) : null,
}));

vi.mock("motion/react", () => ({
  motion: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    div: ({ children, initial, animate, exit, whileHover, transition, ...htmlProps }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...htmlProps}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Tests ---

describe("LibrarySetupOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSettings.mockResolvedValue({});
    mockUseSettings.mockReturnValue({
      settings: {
        audiobookLibraryPath: null,
        ebookLibraryPath: null,
        comicLibraryPath: null,
      },
      isLoading: false,
      error: null,
      updateSettings: mockUpdateSettings,
      isUpdating: false,
      refetch: vi.fn(),
    });
  });

  it("starts on the welcome step", () => {
    render(<LibrarySetupOnboarding onFinish={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText("welcome.title")).toBeInTheDocument();
    expect(screen.getByText("welcome.getStarted")).toBeInTheDocument();
  });

  it("calls onSkip from the welcome step", async () => {
    const onSkip = vi.fn();
    render(<LibrarySetupOnboarding onFinish={vi.fn()} onSkip={onSkip} />);
    await userEvent.click(screen.getByText("welcome.skip"));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("advances to the libraries step and shows all three media types", async () => {
    render(<LibrarySetupOnboarding onFinish={vi.fn()} onSkip={vi.fn()} />);
    await userEvent.click(screen.getByText("welcome.getStarted"));

    expect(screen.getByText("libraries.title")).toBeInTheDocument();
    expect(screen.getByText("audiobooksLabel")).toBeInTheDocument();
    expect(screen.getByText("ebooksLabel")).toBeInTheDocument();
    expect(screen.getByText("comicsLabel")).toBeInTheDocument();
    expect(screen.getAllByText("chooseFolder")).toHaveLength(3);
  });

  it("saves the selected folder for the chosen media type", async () => {
    render(<LibrarySetupOnboarding onFinish={vi.fn()} onSkip={vi.fn()} />);
    await userEvent.click(screen.getByText("welcome.getStarted"));

    // First card is audiobooks.
    await userEvent.click(screen.getAllByText("chooseFolder")[0]!);
    await userEvent.click(screen.getByText("pick-folder"));

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      audiobookLibraryPath: "/picked/path",
    });
  });

  it("reflects an already-configured library and can remove it", async () => {
    mockUseSettings.mockReturnValue({
      settings: {
        audiobookLibraryPath: "/library/audiobooks",
        ebookLibraryPath: null,
        comicLibraryPath: null,
      },
      isLoading: false,
      error: null,
      updateSettings: mockUpdateSettings,
      isUpdating: false,
      refetch: vi.fn(),
    });

    render(<LibrarySetupOnboarding onFinish={vi.fn()} onSkip={vi.fn()} />);
    await userEvent.click(screen.getByText("welcome.getStarted"));

    expect(screen.getByText("/library/audiobooks")).toBeInTheDocument();
    // Configured cards expose a "remove" affordance; unconfigured ones don't.
    await userEvent.click(screen.getByTitle("remove"));
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      audiobookLibraryPath: null,
    });
  });

  it("reaches the done step and calls onFinish", async () => {
    const onFinish = vi.fn();
    render(<LibrarySetupOnboarding onFinish={onFinish} onSkip={vi.fn()} />);

    await userEvent.click(screen.getByText("welcome.getStarted"));
    await userEvent.click(screen.getByText("libraries.continue"));

    expect(screen.getByText("done.title")).toBeInTheDocument();
    await userEvent.click(screen.getByText("done.goToLibrary"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe("WaitingForSetup", () => {
  it("renders a calm waiting message for non-admins", () => {
    render(<WaitingForSetup />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
  });
});
