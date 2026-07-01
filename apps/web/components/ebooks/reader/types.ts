export interface ReaderController {
  prev(): void;
  next(): void;
  goToFraction(fraction: number): void;
  goToHref(href: string): void;
}

export interface ReaderTocItem {
  label: string;
  href: string;
  subitems?: ReaderTocItem[] | null;
}

export interface ReaderRelocateInfo {
  /** Opaque saved location: EPUB CFI, or "page:N" for PDFs. */
  locator: string;
  /** Overall position in the book, 0-1. */
  fraction: number;
  tocLabel?: string | null;
  pageLabel?: string | null;
}
