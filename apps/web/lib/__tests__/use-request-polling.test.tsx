import { afterEach, describe, expect, it, vi } from "vitest";
import { focusManager } from "@tanstack/react-query";
import { act, render, screen } from "../../__test-utils__/render";
import { useMyRequests } from "../use-requests";

function ProgressView() {
  const { data } = useMyRequests();
  return <p>{data?.[0]?.activity.progress ?? "loading"}</p>;
}

describe("Request progress polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    focusManager.setFocused(undefined);
  });

  it("refreshes active views through the authenticated own-request endpoint without polling the source", async () => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ activity: { progress: 0.42 } }],
      })
      .mockResolvedValue({
        ok: true,
        json: async () => [{ activity: { progress: 0.75 } }],
      });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ProgressView />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("0.42")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_100);
    });
    expect(screen.getByText("0.75")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(
        ([url, options]) =>
          url === "/api/requests" && options.credentials === "include",
      ),
    ).toBe(true);
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_100);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
