export const queryKeys = {
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
  },
  series: {
    all: ["series"] as const,
    list: (filters?: { limit?: number; offset?: number }) =>
      [...queryKeys.series.all, "list", filters] as const,
    recentlyUpdated: (limit?: number) =>
      [...queryKeys.series.all, "recently-updated", limit] as const,
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
    detail: (id: string) => [...queryKeys.audiobooks.all, "detail", id] as const,
    authors: (search?: string) => [...queryKeys.audiobooks.all, "authors", search] as const,
    narrators: (search?: string) => [...queryKeys.audiobooks.all, "narrators", search] as const,
    publishers: (search?: string) => [...queryKeys.audiobooks.all, "publishers", search] as const,
    genres: (search?: string) => [...queryKeys.audiobooks.all, "genres", search] as const,
    tags: (search?: string) => [...queryKeys.audiobooks.all, "tags", search] as const,
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
    detail: (id: string) => [...queryKeys.ebooks.all, "detail", id] as const,
    authors: (search?: string) => [...queryKeys.ebooks.all, "authors", search] as const,
    publishers: (search?: string) => [...queryKeys.ebooks.all, "publishers", search] as const,
    genres: (search?: string) => [...queryKeys.ebooks.all, "genres", search] as const,
    tags: (search?: string) => [...queryKeys.ebooks.all, "tags", search] as const,
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
    search: (mediaType: "audiobook" | "ebook", mediaId: string, page?: number) =>
      [...queryKeys.hardcover.all, "search", mediaType, mediaId, page] as const,
    queueStatus: () => [...queryKeys.hardcover.all, "queue", "status"] as const,
  },
  progress: {
    all: ["progress"] as const,
    list: () => [...queryKeys.progress.all, "list"] as const,
    detail: (audiobookId: string) =>
      [...queryKeys.progress.all, "detail", audiobookId] as const,
    stats: () => [...queryKeys.progress.all, "stats"] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    status: () => [...queryKeys.tasks.all, "status"] as const,
    import: () => [...queryKeys.tasks.all, "import"] as const,
    hardcover: () => [...queryKeys.tasks.all, "hardcover"] as const,
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
    savUsers: () => [...queryKeys.restore.all, "sav-users"] as const,
    progress: (sessionId: string) => [...queryKeys.restore.all, "progress", sessionId] as const,
  },
} as const;
