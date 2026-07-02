import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Node >=22 defines `localStorage`/`sessionStorage` on globalThis (undefined
// unless started with --localstorage-file), shadowing jsdom's implementation
// since vitest merges jsdom's window into the same global. Provide a real one.
function createMemoryStorage(): Storage {
  let store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store = new Map();
    },
  };
}
if (typeof localStorage === "undefined") {
  vi.stubGlobal("localStorage", createMemoryStorage());
  vi.stubGlobal("sessionStorage", createMemoryStorage());
}

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) => {
      if (values) {
        return `${key}(${JSON.stringify(values)})`;
      }
      return key;
    };
    t.rich = t;
    t.raw = (key: string) => key;
    t.markup = t;
    t.has = () => true;
    return t;
  },
  useLocale: () => "en",
  useFormatter: () => ({
    number: (n: number) => String(n),
    dateTime: (d: Date) => d.toISOString(),
    relativeTime: (v: number) => `${v}`,
  }),
}));

// Mock ResizeObserver (needed by Radix UI ScrollArea)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal("ResizeObserver", MockResizeObserver);

// Mock HTMLAudioElement
class MockAudioElement {
  src = "";
  currentTime = 0;
  duration = 0;
  volume = 1;
  playbackRate = 1;
  paused = true;
  preload = "auto";

  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  load = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

vi.stubGlobal("Audio", MockAudioElement);

// Mock MediaSession API
if (!navigator.mediaSession) {
  Object.defineProperty(navigator, "mediaSession", {
    value: {
      metadata: null,
      setActionHandler: vi.fn(),
      setPositionState: vi.fn(),
    },
    writable: true,
  });
}
