import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import React from "react";
import { useIntersectionObserver } from "../use-intersection-observer";

// Track all created observers
let observers: {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}[];

function setupMock() {
  observers = [];

  class MockIntersectionObserver {
    callback: IntersectionObserverCallback;
    options: IntersectionObserverInit | undefined;
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    takeRecords = vi.fn().mockReturnValue([]);
    root = null;
    rootMargin: string;
    thresholds: readonly number[];

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      this.callback = callback;
      this.options = options;
      this.rootMargin = options?.rootMargin ?? "";
      this.thresholds = Array.isArray(options?.threshold)
        ? options.threshold
        : [options?.threshold ?? 0];
      observers.push(this);
    }
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
}

/**
 * Test component that uses the hook and attaches the ref to a real DOM element.
 */
function TestComponent({
  callback,
  options,
}: {
  callback: () => void;
  options?: Parameters<typeof useIntersectionObserver>[1];
}) {
  const ref = useIntersectionObserver(callback, options);
  return <div ref={ref} data-testid="observed" />;
}

describe("useIntersectionObserver", () => {
  beforeEach(() => {
    setupMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    observers = [];
  });

  it("returns a ref object", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useIntersectionObserver(callback));
    expect(result.current).toHaveProperty("current");
  });

  it("creates an observer and observes the element", () => {
    const callback = vi.fn();
    render(<TestComponent callback={callback} />);

    expect(observers).toHaveLength(1);
    expect(observers[0]!.observe).toHaveBeenCalledOnce();
    // It should observe the actual DOM element
    expect(observers[0]!.observe).toHaveBeenCalledWith(
      screen.getByTestId("observed")
    );
  });

  it("fires the callback when element is intersecting", () => {
    const callback = vi.fn();
    render(<TestComponent callback={callback} />);

    act(() => {
      observers[0]!.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(callback).toHaveBeenCalledOnce();
  });

  it("does not fire callback when element is not intersecting", () => {
    const callback = vi.fn();
    render(<TestComponent callback={callback} />);

    act(() => {
      observers[0]!.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(callback).not.toHaveBeenCalled();
  });

  it("disconnects observer on unmount", () => {
    const callback = vi.fn();
    const { unmount } = render(<TestComponent callback={callback} />);

    expect(observers[0]!.disconnect).not.toHaveBeenCalled();

    unmount();

    expect(observers[0]!.disconnect).toHaveBeenCalledOnce();
  });

  it("uses default options (threshold: 0, rootMargin: 100px)", () => {
    const callback = vi.fn();
    render(<TestComponent callback={callback} />);

    expect(observers[0]!.options).toEqual({
      threshold: 0,
      rootMargin: "100px",
    });
  });

  it("passes custom threshold and rootMargin to observer", () => {
    const callback = vi.fn();
    render(
      <TestComponent
        callback={callback}
        options={{ threshold: 0.5, rootMargin: "200px" }}
      />
    );

    expect(observers[0]!.options).toEqual({
      threshold: 0.5,
      rootMargin: "200px",
    });
  });

  it("does not create observer when enabled is false", () => {
    const callback = vi.fn();
    render(
      <TestComponent callback={callback} options={{ enabled: false }} />
    );

    expect(observers).toHaveLength(0);
  });

  it("uses latest callback via ref without recreating observer", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { rerender } = render(<TestComponent callback={callback1} />);

    const observerCountAfterMount = observers.length;
    expect(observerCountAfterMount).toBe(1);

    // Update callback -- options haven't changed so observer should not be recreated
    rerender(<TestComponent callback={callback2} />);

    expect(observers.length).toBe(observerCountAfterMount);

    // Trigger intersection -- should call the LATEST callback (callback2)
    act(() => {
      observers[0]!.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      );
    });

    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledOnce();
  });
});
