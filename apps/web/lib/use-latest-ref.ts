import { useEffect, useRef } from "react";

/**
 * Keeps a ref pointing at the newest value without writing to it during render.
 *
 * The shape this replaces — `const ref = useRef(value); ref.current = value;` —
 * mutates a ref straight from the render body, which makes render impure.
 * React is allowed to render a component and then throw the result away
 * (StrictMode's double render, an interrupted concurrent render, a suspended
 * sibling), and every one of those still runs the assignment. The ref can end
 * up holding a value from a render that never committed, so a callback firing
 * afterwards sees state the user never saw.
 *
 * Assigning in an effect keeps the useful half of the pattern — anything that
 * reads the ref *after* mount, such as an event listener, timer, or async
 * continuation, still gets the latest value — while only ever recording values
 * that actually reached the DOM. Reads during render are still wrong, and are
 * still reported by `react-hooks/refs`.
 *
 * The ref is seeded with the first value, so consumers that read it inside a
 * mount effect (after an `await`, say) see the right thing on the first pass.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}
