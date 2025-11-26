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
    list: (filters?: { libraryId?: string; search?: string }) =>
      [...queryKeys.audiobooks.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.audiobooks.all, "detail", id] as const,
    byLibrary: (libraryId: string) =>
      [...queryKeys.audiobooks.all, "library", libraryId] as const,
  },
  filesystem: {
    all: ["filesystem"] as const,
    browse: (path: string) => [...queryKeys.filesystem.all, "browse", path] as const,
  },
} as const;
