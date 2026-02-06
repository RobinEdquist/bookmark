export const queryKeys = {
  tags: {
    all: ["tags"] as const,
    list: (search?: string) => [...queryKeys.tags.all, "list", search] as const,
  },
  settings: {
    all: ["settings"] as const,
    public: () => [...queryKeys.settings.all, "public"] as const,
    private: () => [...queryKeys.settings.all, "private"] as const,
    authConfig: () => [...queryKeys.settings.all, "auth-config"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (filters?: { search?: string; role?: string }) =>
      [...queryKeys.users.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.users.all, "detail", id] as const,
  },
  libraries: {
    all: ["libraries"] as const,
    list: (filters?: { search?: string }) =>
      [...queryKeys.libraries.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.libraries.all, "detail", id] as const,
  },
  library: {
    all: ["library"] as const,
    stats: () => [...queryKeys.library.all, "stats"] as const,
    availability: () => [...queryKeys.library.all, "availability"] as const,
    search: (query: string, contentType: string) =>
      [...queryKeys.library.all, "search", query, contentType] as const,
  },
  series: {
    all: ["series"] as const,
    list: (filters?: { limit?: number; offset?: number }) =>
      [...queryKeys.series.all, "list", filters] as const,
    infinite: (filters?: {
      search?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.series.all, "infinite", filters] as const,
    detail: (id: string) => [...queryKeys.series.all, "detail", id] as const,
    recentlyUpdated: (limit?: number) =>
      [...queryKeys.series.all, "recently-updated", limit] as const,
    options: (search?: string) =>
      [...queryKeys.series.all, "options", search] as const,
  },
  audiobooks: {
    all: ["audiobooks"] as const,
    list: (filters?: {
      search?: string;
      genreId?: string;
      seriesId?: string;
      language?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.audiobooks.all, "list", filters] as const,
    infinite: (filters?: {
      search?: string;
      genreId?: string;
      seriesId?: string;
      language?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.audiobooks.all, "infinite", filters] as const,
    detail: (id: string) => [...queryKeys.audiobooks.all, "detail", id] as const,
    authors: (search?: string) => [...queryKeys.audiobooks.all, "authors", search] as const,
    narrators: (search?: string) => [...queryKeys.audiobooks.all, "narrators", search] as const,
    publishers: (search?: string) => [...queryKeys.audiobooks.all, "publishers", search] as const,
    genres: (search?: string) => [...queryKeys.audiobooks.all, "genres", search] as const,
  },
  ebooks: {
    all: ["ebooks"] as const,
    list: (filters?: {
      search?: string;
      genreId?: string;
      seriesId?: string;
      language?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.ebooks.all, "list", filters] as const,
    infinite: (filters?: {
      search?: string;
      genreId?: string;
      seriesId?: string;
      language?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.ebooks.all, "infinite", filters] as const,
    detail: (id: string) => [...queryKeys.ebooks.all, "detail", id] as const,
    authors: (search?: string) => [...queryKeys.ebooks.all, "authors", search] as const,
    publishers: (search?: string) => [...queryKeys.ebooks.all, "publishers", search] as const,
    genres: (search?: string) => [...queryKeys.ebooks.all, "genres", search] as const,
  },
  filesystem: {
    all: ["filesystem"] as const,
    browse: (path: string) => [...queryKeys.filesystem.all, "browse", path] as const,
  },
  hardcover: {
    all: ["hardcover"] as const,
    status: () => [...queryKeys.hardcover.all, "status"] as const,
    link: (mediaType: "audiobook" | "ebook", mediaId: string) =>
      [...queryKeys.hardcover.all, "link", mediaType, mediaId] as const,
    search: (mediaType: "audiobook" | "ebook", mediaId: string, page?: number, customQuery?: string) =>
      [...queryKeys.hardcover.all, "search", mediaType, mediaId, page, customQuery] as const,
    queueStatus: () => [...queryKeys.hardcover.all, "queue", "status"] as const,
  },
  progress: {
    all: ["progress"] as const,
    list: () => [...queryKeys.progress.all, "list"] as const,
    detail: (audiobookId: string) =>
      [...queryKeys.progress.all, "detail", audiobookId] as const,
    stats: () => [...queryKeys.progress.all, "stats"] as const,
  },
  ebookProgress: {
    all: ["ebook-progress"] as const,
    list: () => [...queryKeys.ebookProgress.all, "list"] as const,
    detail: (ebookId: string) =>
      [...queryKeys.ebookProgress.all, "detail", ebookId] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    status: () => [...queryKeys.tasks.all, "status"] as const,
    import: () => [...queryKeys.tasks.all, "import"] as const,
    hardcover: () => [...queryKeys.tasks.all, "hardcover"] as const,
    scan: () => [...queryKeys.tasks.all, "scan"] as const,
    rescan: () => [...queryKeys.tasks.all, "rescan"] as const,
  },
  importErrors: {
    all: ["importErrors"] as const,
    list: () => [...queryKeys.importErrors.all, "list"] as const,
    detail: (id: string) =>
      [...queryKeys.importErrors.all, "detail", id] as const,
  },
  restore: {
    all: ["restore"] as const,
    session: (sessionId: string) => [...queryKeys.restore.all, "session", sessionId] as const,
    preview: (sessionId: string) => [...queryKeys.restore.all, "preview", sessionId] as const,
    bookmarkUsers: () => [...queryKeys.restore.all, "bookmark-users"] as const,
    progress: (sessionId: string) => [...queryKeys.restore.all, "progress", sessionId] as const,
  },
  requests: {
    all: ['requests'] as const,
    list: () => [...queryKeys.requests.all, 'list'] as const,
    search: (query: string) => [...queryKeys.requests.all, 'search', query] as const,
    detail: (id: string) => [...queryKeys.requests.all, 'detail', id] as const,
    autoApproveBudget: () => [...queryKeys.requests.all, 'auto-approve-budget'] as const,
  },
  adminRequests: {
    all: ['admin-requests'] as const,
    list: (status?: string) => [...queryKeys.adminRequests.all, 'list', status] as const,
  },
  audnexus: {
    all: ['audnexus'] as const,
    search: (title: string, author?: string) =>
      [...queryKeys.audnexus.all, 'search', title, author] as const,
    chapters: (asin: string) =>
      [...queryKeys.audnexus.all, 'chapters', asin] as const,
  },
  lists: {
    all: ['lists'] as const,
    list: () => [...queryKeys.lists.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.lists.all, 'detail', id] as const,
    forItem: (itemType: 'audiobook' | 'ebook', itemId: string) =>
      [...queryKeys.lists.all, 'for-item', itemType, itemId] as const,
    recent: (limit?: number) => [...queryKeys.lists.all, 'recent', limit] as const,
  },
  grFinder: {
    all: ['gr-finder'] as const,
    status: () => [...queryKeys.grFinder.all, 'status'] as const,
    search: (query: string) => [...queryKeys.grFinder.all, 'search', query] as const,
    link: (mediaType: "audiobook" | "ebook", mediaId: string) =>
      [...queryKeys.grFinder.all, 'link', mediaType, mediaId] as const,
  },
  announcements: {
    all: ['announcements'] as const,
    active: () => [...queryKeys.announcements.all, 'active'] as const,
    admin: () => [...queryKeys.announcements.all, 'admin'] as const,
  },
  adminGenres: {
    all: ['admin-genres'] as const,
    list: () => [...queryKeys.adminGenres.all, 'list'] as const,
  },
} as const;
