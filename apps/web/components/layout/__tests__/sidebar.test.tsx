import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { Sidebar } from "../sidebar";

// --- Hoisted mocks ---
const {
  mockSignOut,
  mockUseSession,
  mockUsePathname,
  mockUseLibraryAvailability,
  mockUseUserSettings,
  mockUseMyPermissions,
} = vi.hoisted(() => ({
  mockSignOut: vi.fn().mockResolvedValue(undefined),
  mockUseSession: vi.fn().mockReturnValue({ data: null }),
  mockUsePathname: vi.fn().mockReturnValue("/"),
  mockUseLibraryAvailability: vi.fn().mockReturnValue({ data: undefined }),
  mockUseUserSettings: vi.fn().mockReturnValue({ settings: null }),
  mockUseMyPermissions: vi.fn().mockReturnValue({ data: undefined }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockUsePathname(),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    scroll: _scroll,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    scroll?: boolean;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("../../../lib/auth-client", () => ({
  authClient: {
    signOut: (...args: unknown[]) => mockSignOut(...args),
    useSession: () => mockUseSession(),
  },
}));

vi.mock("../../../lib/use-library-availability", () => ({
  useLibraryAvailability: () => mockUseLibraryAvailability(),
}));

vi.mock("../../../lib/use-settings", () => ({
  useUserSettings: () => mockUseUserSettings(),
}));

vi.mock("../../../lib/use-users", () => ({
  useMyPermissions: () => mockUseMyPermissions(),
}));

vi.mock("../tasks-indicator", () => ({
  TasksIndicator: () => <div data-testid="tasks-indicator" />,
}));

vi.mock("../app-logo", () => ({
  AppLogo: ({ onClick }: { onClick?: () => void }) => (
    <div data-testid="app-logo" onClick={onClick}>
      Logo
    </div>
  ),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue("/");
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: true, ebooks: true, opds: false },
    });
    mockUseUserSettings.mockReturnValue({
      settings: { requestsEnabled: false },
    });
    mockUseMyPermissions.mockReturnValue({
      data: { canRequestContent: false, canGenerateApiKeys: false },
    });
    mockUseSession.mockReturnValue({
      data: { user: { name: "Test User", email: "test@example.com" } },
    });
    // Reset window.location for signOut tests
    Object.defineProperty(window, "location", {
      writable: true,
      value: { href: "" },
    });
  });

  it("renders the app logo", () => {
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByTestId("app-logo")).toBeInTheDocument();
  });

  it("renders Home link always", () => {
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.home")).toBeInTheDocument();
  });

  it("renders Audiobooks link when audiobooks are available", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: true, ebooks: false, opds: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.audiobooks")).toBeInTheDocument();
  });

  it("does not render Audiobooks link when audiobooks are unavailable", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: false, ebooks: false, opds: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.queryByText("nav.audiobooks")).not.toBeInTheDocument();
  });

  it("renders Ebooks link when ebooks are available", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: false, ebooks: true, opds: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.ebooks")).toBeInTheDocument();
  });

  it("renders always-visible nav items (series, lists, topList)", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: false, ebooks: false, opds: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.series")).toBeInTheDocument();
    expect(screen.getByText("nav.lists")).toBeInTheDocument();
    expect(screen.getByText("nav.topList")).toBeInTheDocument();
  });

  it("renders Settings link only for admin users", () => {
    const { unmount } = render(<Sidebar isAdmin={false} />);
    expect(screen.queryByText("nav.settings")).not.toBeInTheDocument();
    unmount();

    render(<Sidebar isAdmin={true} />);
    expect(screen.getByText("nav.settings")).toBeInTheDocument();
  });

  it("shows the signed-in user on the account button", () => {
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("falls back to the account label before the session loads", () => {
    mockUseSession.mockReturnValue({ data: null });
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.sections.account")).toBeInTheDocument();
  });

  it("keeps sign out in the account menu", async () => {
    const user = userEvent.setup();
    render(<Sidebar isAdmin={false} />);
    expect(screen.queryByText("nav.signOut")).not.toBeInTheDocument();

    await user.click(screen.getByText("Test User"));

    expect(
      await screen.findByRole("menuitem", { name: "nav.signOut" }),
    ).toBeInTheDocument();
  });

  it("calls signOut and redirects on sign out click", async () => {
    const user = userEvent.setup();
    render(<Sidebar isAdmin={false} />);

    await user.click(screen.getByText("Test User"));
    await user.click(
      await screen.findByRole("menuitem", { name: "nav.signOut" }),
    );

    expect(mockSignOut).toHaveBeenCalled();
  });

  it("marks the current page's link", () => {
    mockUsePathname.mockReturnValue("/ebooks/123");
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.ebooks").closest("a")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("nav.home").closest("a")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("calls onNavigate callback when a nav link is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<Sidebar isAdmin={false} onNavigate={onNavigate} />);

    await user.click(screen.getByText("nav.home"));

    expect(onNavigate).toHaveBeenCalled();
  });

  it("renders My Stats and Preferences in the account menu for all users", async () => {
    const user = userEvent.setup();
    render(<Sidebar isAdmin={false} />);

    await user.click(screen.getByText("Test User"));

    expect(
      await screen.findByRole("menuitem", { name: "nav.myStats" }),
    ).toHaveAttribute("href", "/users/me");
    expect(
      screen.getByRole("menuitem", { name: "nav.preferences" }),
    ).toHaveAttribute("href", "/preferences");
  });

  it("shows Fix Metadata under Manage for non-admins who can edit metadata", () => {
    mockUseMyPermissions.mockReturnValue({
      data: {
        canRequestContent: false,
        canGenerateApiKeys: false,
        canEditMetadata: true,
      },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.sections.manage")).toBeInTheDocument();
    expect(screen.getByText("nav.fixMetadata")).toBeInTheDocument();
    expect(screen.queryByText("nav.settings")).not.toBeInTheDocument();
  });

  it("hides the Manage section when it has nothing to show", () => {
    render(<Sidebar isAdmin={false} />);
    expect(screen.queryByText("nav.sections.manage")).not.toBeInTheDocument();
  });

  it("renders Genres link when audiobooks or ebooks are available", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: true, ebooks: false, opds: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.genres")).toBeInTheDocument();
  });

  it("does not render Genres link when no libraries are available", () => {
    mockUseLibraryAvailability.mockReturnValue({
      data: { audiobooks: false, ebooks: false, opds: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.queryByText("nav.genres")).not.toBeInTheDocument();
  });

  it("shows requests link when requests are enabled and user has permission", () => {
    mockUseUserSettings.mockReturnValue({
      settings: { requestsEnabled: true },
    });
    mockUseMyPermissions.mockReturnValue({
      data: { canRequestContent: true, canGenerateApiKeys: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByText("nav.requests")).toBeInTheDocument();
  });

  it("does not show requests link when requests are disabled", () => {
    mockUseUserSettings.mockReturnValue({
      settings: { requestsEnabled: false },
    });
    mockUseMyPermissions.mockReturnValue({
      data: { canRequestContent: true, canGenerateApiKeys: false },
    });
    render(<Sidebar isAdmin={false} />);
    expect(screen.queryByText("nav.requests")).not.toBeInTheDocument();
  });

  it("shows manage requests link for admin when requests are enabled", () => {
    mockUseUserSettings.mockReturnValue({
      settings: { requestsEnabled: true },
    });
    mockUseMyPermissions.mockReturnValue({
      data: { canRequestContent: false, canGenerateApiKeys: false },
    });
    render(<Sidebar isAdmin={true} />);
    // Admin always gets requests access when enabled
    expect(screen.getByText("nav.manageRequests")).toBeInTheDocument();
  });

  it("renders the tasks indicator", () => {
    render(<Sidebar isAdmin={false} />);
    expect(screen.getByTestId("tasks-indicator")).toBeInTheDocument();
  });
});
