export const queryKeys = {
  settings: {
    all: ["settings"] as const,
    public: () => [...queryKeys.settings.all, "public"] as const,
    private: () => [...queryKeys.settings.all, "private"] as const,
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
  filesystem: {
    all: ["filesystem"] as const,
    browse: (path: string) => [...queryKeys.filesystem.all, "browse", path] as const,
  },
  hardcover: {
    all: ["hardcover"] as const,
    status: () => [...queryKeys.hardcover.all, "status"] as const,
    link: (audiobookId: string) =>
      [...queryKeys.hardcover.all, "link", audiobookId] as const,
    search: (audiobookId: string, page?: number) =>
      [...queryKeys.hardcover.all, "search", audiobookId, page] as const,
    queueStatus: () => [...queryKeys.hardcover.all, "queue", "status"] as const,
  },
} as const;
