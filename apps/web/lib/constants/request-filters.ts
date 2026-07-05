export const SEARCH_IN_FIELDS = [
  { id: "title", labelKey: "title" },
  { id: "author", labelKey: "author" },
  { id: "narrator", labelKey: "narrator" },
  { id: "series", labelKey: "series" },
  { id: "tags", labelKey: "tags" },
  { id: "description", labelKey: "description" },
] as const;

export const PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
