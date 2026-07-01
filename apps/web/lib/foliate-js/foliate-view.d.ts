// Hand-written types for the vendored foliate-js <foliate-view> element.
// Only the surface used by the Bookmark reader is typed; see VENDOR.md.

export interface FoliateTocItem {
  label: string;
  href: string;
  subitems?: FoliateTocItem[] | null;
}

export interface FoliateRelocateDetail {
  /** EPUB CFI (synthesized for non-EPUB formats). */
  cfi: string;
  /** Overall position in the book, 0–1. */
  fraction: number;
  tocItem?: FoliateTocItem | null;
  pageItem?: { label: string } | null;
  section?: { current: number; total: number };
  location?: { current: number; next: number; total: number };
}

/** Fired by the resource loader for each manifest item (EPUB only). */
export interface FoliateLoadDetail {
  type: string;
  isScript: boolean;
  /** Set to false to block the resource from loading. */
  allow: boolean | Promise<boolean>;
}

/** Fired by the resource loader before a blob URL is created (EPUB only). */
export interface FoliateDataDetail {
  readonly name: string;
  data: unknown;
  type: string;
}

export interface FoliateBook {
  metadata?: { title?: unknown };
  toc?: FoliateTocItem[];
  dir?: string;
  /** EPUB loader event target; emits "load" and "data" events. */
  transformTarget?: EventTarget;
}

export interface FoliateRenderer extends HTMLElement {
  /** Attributes: "flow" (paginated|scrolled), "gap" (e.g. "6%"),
   *  "max-column-count", "max-inline-size", "max-block-size", "animated". */
  setStyles?: (css: string | [string, string]) => void;
  prev(distance?: number): Promise<void>;
  next(distance?: number): Promise<void>;
}

export interface FoliateView extends HTMLElement {
  open(book: File | Blob | string): Promise<void>;
  init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
  goTo(target: string | number): Promise<unknown>;
  goToFraction(fraction: number): Promise<void>;
  prev(distance?: number): Promise<void>;
  next(distance?: number): Promise<void>;
  close(): void;
  book: FoliateBook;
  renderer: FoliateRenderer;
  lastLocation: FoliateRelocateDetail | null;
}

declare module "*/foliate-js/view.js" {
  export function makeBook(file: File | Blob | string): Promise<unknown>;
}
