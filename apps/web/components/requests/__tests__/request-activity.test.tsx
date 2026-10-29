import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  userEvent,
  waitFor,
} from "../../../__test-utils__/render";
import { RequestActivity } from "../request-activity";
import { RequestDiagnostics } from "../request-diagnostics";
import type { RequestActivity as Activity } from "../../../lib/use-requests";

const activity: Activity = {
  stage: "downloading",
  transferState: "downloading",
  progress: 0.42,
  observedAt: "2026-10-14T12:00:00Z",
  stale: false,
  issue: null,
};

describe("Request progress presentation", () => {
  it("shows the actual observed percentage with an accessible progress bar", () => {
    render(<RequestActivity activity={activity} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(screen.getByText("stage.downloading")).toBeInTheDocument();
  });
  it("keeps known zero separate from unknown progress", () => {
    const { rerender } = render(
      <RequestActivity activity={{ ...activity, progress: 0 }} />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    rerender(<RequestActivity activity={{ ...activity, progress: null }} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText("progressUnknown")).toBeInTheDocument();
  });
  it.each(["paused", "stalled", "queued", "checking"] as const)(
    "explains %s and retains the stale progress",
    (issue) => {
      render(
        <RequestActivity
          activity={{ ...activity, issue, transferState: issue, stale: true }}
        />,
      );
      expect(screen.getByText(`issue.${issue}`)).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("stale");
      expect(screen.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        "42",
      );
    },
  );
  it("does not call a finished transfer ready before import", () => {
    render(
      <RequestActivity
        activity={{
          ...activity,
          stage: "adding_to_library",
          transferState: "completed",
          progress: 1,
        }}
      />,
    );
    expect(screen.getByText("stage.adding_to_library")).toBeInTheDocument();
    expect(screen.queryByText("stage.ready")).not.toBeInTheDocument();
  });
  it("explains an import failure without exposing source paths or messages", () => {
    render(
      <RequestActivity
        activity={{
          ...activity,
          stage: "needs_attention",
          issue: "import_failed",
        }}
      />,
    );
    expect(screen.getByText("issue.import_failed")).toBeInTheDocument();
    expect(screen.getByText("stage.needs_attention")).toBeInTheDocument();
  });
});

describe("Admin request recovery", () => {
  afterEach(() => vi.unstubAllGlobals());
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  it("loads diagnostics only when opened and retries the correlated import", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        activity,
        rawState: "error",
        importErrorId: "error-1",
        importPath: "/library/broken.epub",
        importMessage: "Unreadable archive",
        importStatus: "pending",
        canReconcile: false,
        canRetry: false,
        submissionReason: null,
      }),
    });
    const user = userEvent.setup();
    render(<RequestDiagnostics requestId="request-1" />);
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByText("title"));
    await waitFor(() =>
      expect(screen.getByText("Unreadable archive")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/requests/request-1/diagnostics",
      { credentials: "include" },
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        activity,
        importErrorId: "error-1",
        importStatus: "retrying",
      }),
    });
    await user.click(screen.getByRole("button", { name: "retryImport" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/import-errors/error-1/retry",
        { method: "POST", credentials: "include" },
      ),
    );
  });
  it.each([
    ["retry", "retry-submission", { canRetry: true, canReconcile: false }],
    ["reconcile", "reconcile", { canRetry: false, canReconcile: true }],
  ] as const)(
    "shows only the %s action and posts it to the matching endpoint",
    async (label, action, flags) => {
      const other = label === "retry" ? "reconcile" : "retry";
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          activity: {
            ...activity,
            stage: "needs_attention",
            issue:
              label === "retry" ? "submission_failed" : "submission_uncertain",
          },
          rawState: null,
          importErrorId: null,
          importPath: null,
          importMessage: null,
          importStatus: null,
          submissionReason: "Source HTTP 503: download client unreachable",
          ...flags,
        }),
      });
      const user = userEvent.setup();
      render(<RequestDiagnostics requestId="request-1" />);
      await user.click(screen.getByText("title"));
      await waitFor(() =>
        expect(screen.getByRole("button", { name: label })).toBeInTheDocument(),
      );
      expect(screen.getByText(`${label}Description`)).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: other }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText("Source HTTP 503: download client unreachable"),
      ).toBeInTheDocument();
      // The action response and the diagnostics refetch share this mock.
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          activity,
          rawState: null,
          importErrorId: null,
          importPath: null,
          importMessage: null,
          importStatus: null,
          submissionReason: null,
          canRetry: false,
          canReconcile: false,
        }),
      });
      await user.click(screen.getByRole("button", { name: label }));
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          `/api/admin/requests/request-1/${action}`,
          { method: "POST", credentials: "include" },
        ),
      );
    },
  );
});
