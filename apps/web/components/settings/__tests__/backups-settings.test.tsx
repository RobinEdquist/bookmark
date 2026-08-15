import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent } from "../../../__test-utils__/render";
import { BackupsSettings } from "../backups-settings";

const { mockUseBackups } = vi.hoisted(() => ({
  mockUseBackups: vi.fn(),
}));

vi.mock("../../../lib/use-backups", () => ({
  useBackups: mockUseBackups,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
  },
}));

function mutation() {
  return {
    isPending: false,
    mutateAsync: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseBackups.mockReturnValue({
    overview: {
      data: {
        config: {
          enabled: true,
          path: "/data/backups",
          pathLocked: false,
          schedule: "0 2 * * *",
          retention: 7,
          timezone: "Europe/Stockholm",
          nextBackupAt: "2026-08-16T00:00:00.000Z",
          isRunning: false,
          pathError: null,
        },
        backups: [
          {
            id: "backup-1",
            filename: "bookmark-2026-08-15.bookmark",
            createdAt: "2026-08-15T10:00:00.000Z",
            size: 1024,
            appVersion: "1.2.3",
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    },
    updateConfig: mutation(),
    createBackup: mutation(),
    uploadBackup: mutation(),
    deleteBackup: mutation(),
    restoreBackup: mutation(),
  });
});

describe("BackupsSettings", () => {
  it("uses a theme-colored clock while preserving the native time input", () => {
    render(<BackupsSettings />);

    const input = screen.getByLabelText("automatic.time");
    const wrapper = input.parentElement;
    const clock = wrapper?.querySelector("svg");

    expect(input).toHaveAttribute("type", "time");
    expect(input).toHaveClass(
      "peer",
      "pr-10",
      "[&::-webkit-calendar-picker-indicator]:opacity-0",
    );
    expect(wrapper).toHaveClass("text-foreground");
    expect(clock).toHaveAttribute("aria-hidden", "true");
    expect(clock).toHaveClass(
      "pointer-events-none",
      "peer-disabled:opacity-50",
    );
  });

  it.each([
    ["link", "archives.download", "archives.tooltips.download"],
    ["button", "archives.restore", "archives.tooltips.restore"],
    ["button", "archives.delete", "archives.tooltips.delete"],
  ] as const)(
    "shows a tooltip for the %s archive action",
    async (role, accessibleName, tooltipLabel) => {
      const user = userEvent.setup();
      render(<BackupsSettings />);

      const action = screen.getByRole(role, {
        name: new RegExp(accessibleName),
      });
      await user.hover(action);

      expect(await screen.findByRole("tooltip")).toHaveTextContent(
        tooltipLabel,
      );
    },
  );
});
