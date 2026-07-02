import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollRestoration } from "../use-scroll-restoration";

const route = vi.hoisted(() => ({ pathname: "/library", search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));

describe("useScrollRestoration", () => {
  let container: HTMLElement;
  let testId = 0;

  beforeEach(() => {
    // Unique pathname per test: the hook's position map is module-level state
    route.pathname = `/library-${++testId}`;
    route.search = "";
    container = document.createElement("main");
    container.setAttribute("data-scroll-container", "");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  /** Simulate a user scroll: set the position and fire the event. */
  function scrollTo(position: number) {
    container.scrollTop = position;
    container.dispatchEvent(new Event("scroll"));
  }

  it("pins to top on mount when nothing is saved", () => {
    container.scrollTop = 300;

    const { result } = renderHook(() => useScrollRestoration({ ready: true }));

    expect(container.scrollTop).toBe(0);
    expect(result.current.hasSavedPosition).toBe(false);
  });

  it("restores the saved position on remount", () => {
    const first = renderHook(() => useScrollRestoration({ ready: true }));
    expect(first.result.current.hasSavedPosition).toBe(false);
    scrollTo(500);
    first.unmount();
    container.scrollTop = 0;

    const second = renderHook(() => useScrollRestoration({ ready: true }));

    expect(container.scrollTop).toBe(500);
    expect(second.result.current.hasSavedPosition).toBe(true);
  });

  it("defers restoration until ready, pinning skeletons to top", () => {
    const first = renderHook(() => useScrollRestoration({ ready: true }));
    scrollTo(500);
    first.unmount();
    container.scrollTop = 123;

    const { rerender } = renderHook(
      (props: { ready: boolean }) => useScrollRestoration(props),
      { initialProps: { ready: false } }
    );
    expect(container.scrollTop).toBe(0);

    rerender({ ready: true });

    // The stash captured at mount survives the zero-pin write-through
    expect(container.scrollTop).toBe(500);
  });

  it("restores at most once per mount", () => {
    const first = renderHook(() => useScrollRestoration({ ready: true }));
    scrollTo(500);
    first.unmount();

    const second = renderHook(
      (props: { ready: boolean }) => useScrollRestoration(props),
      { initialProps: { ready: true } }
    );
    expect(container.scrollTop).toBe(500);

    container.scrollTop = 50;
    second.rerender({ ready: false });
    second.rerender({ ready: true });

    expect(container.scrollTop).toBe(50);
  });

  it("does not restore when extraKey differs", () => {
    const first = renderHook(() =>
      useScrollRestoration({ ready: true, extraKey: "title:asc" })
    );
    scrollTo(400);
    first.unmount();

    const second = renderHook(() =>
      useScrollRestoration({ ready: true, extraKey: "createdAt:desc" })
    );

    expect(container.scrollTop).toBe(0);
    expect(second.result.current.hasSavedPosition).toBe(false);
  });

  it("re-keys saving when the URL changes while mounted", () => {
    const view = renderHook(() => useScrollRestoration({ ready: true }));
    scrollTo(200);

    route.search = "search=x";
    view.rerender();
    // Filter changes must not move the scroll position
    expect(container.scrollTop).toBe(200);

    scrollTo(700);
    view.unmount();
    container.scrollTop = 0;

    // Remounting on the filtered URL restores what was saved under it
    const filtered = renderHook(() => useScrollRestoration({ ready: true }));
    expect(container.scrollTop).toBe(700);
    filtered.unmount();

    // The unfiltered URL still has its own entry
    route.search = "";
    container.scrollTop = 0;
    renderHook(() => useScrollRestoration({ ready: true }));
    expect(container.scrollTop).toBe(200);
  });

  it("snapshots the position on unmount even without scroll events", () => {
    const first = renderHook(() => useScrollRestoration({ ready: true }));
    container.scrollTop = 250; // no scroll event dispatched
    first.unmount();
    container.scrollTop = 0;

    const second = renderHook(() => useScrollRestoration({ ready: true }));

    expect(container.scrollTop).toBe(250);
    expect(second.result.current.hasSavedPosition).toBe(true);
  });

  it("tolerates a missing container", () => {
    container.remove();

    const view = renderHook(
      (props: { ready: boolean }) => useScrollRestoration(props),
      { initialProps: { ready: false } }
    );
    expect(view.result.current.hasSavedPosition).toBe(false);
    view.rerender({ ready: true });
    expect(() => view.unmount()).not.toThrow();
  });

  it("restores an explicit zero position", () => {
    const first = renderHook(() => useScrollRestoration({ ready: true }));
    scrollTo(400);
    scrollTo(0);
    first.unmount();
    container.scrollTop = 300;

    const second = renderHook(() => useScrollRestoration({ ready: true }));

    expect(container.scrollTop).toBe(0);
    expect(second.result.current.hasSavedPosition).toBe(true);
  });

  it("is idempotent under StrictMode double-mounting", () => {
    const first = renderHook(() => useScrollRestoration({ ready: true }));
    scrollTo(500);
    first.unmount();
    container.scrollTop = 0;

    const strict = renderHook(() => useScrollRestoration({ ready: true }), {
      wrapper: StrictMode,
    });

    expect(container.scrollTop).toBe(500);
    expect(strict.result.current.hasSavedPosition).toBe(true);

    // The doubled mount/cleanup cycle must not corrupt the saved entry
    strict.unmount();
    container.scrollTop = 0;
    renderHook(() => useScrollRestoration({ ready: true }));
    expect(container.scrollTop).toBe(500);
  });
});
