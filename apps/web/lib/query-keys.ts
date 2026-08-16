export const queryKeys = {
  tags: {
    all: ["tags"] as const,
    list: (search?: string) => [...queryKeys.tags.all, "list", search] as const,
  },
  version: {
    all: ["version"] as const,
    current: () => [...queryKeys.version.all, "current"] as const,
  },
  settings: {
    all: ["settings"] as const,
    public: () => [...queryKeys.settings.all, "public"] as const,
    private: () => [...queryKeys.settings.all, "private"] as const,
    authConfig: () => [...queryKeys.settings.all, "auth-config"] as const,
  },
  backups: {
    all: ["backups"] as const,
    overview: () => [...queryKeys.backups.all, "overview"] as const,
  },
  users: {
    all: ["users"] as const,
    list: (filters?: { search?: string; role?: string }) =>
      [...queryKeys.users.all, "list", filters] as const,
    detail: (id: string) => [...queryKeys.users.all, "detail", id] as const,
  },
  userProfile: {
    all: ["user-profile"] as const,
    stats: (id: string) => [...queryKeys.userProfile.all, "stats", id] as const,
    activity: (id: string, year: number) =>
      [...queryKeys.userProfile.all, "activity", id, year] as const,
    libraryProgress: (
      id: string,
      filters?: {
        type?: string;
        status?: string;
        sort?: string;
        limit?: number;
        offset?: number;
      },
    ) =>
      [...queryKeys.userProfile.all, "library-progress", id, filters] as const,
    listeningHistory: (id: string, offset?: number) =>
      [...queryKeys.userProfile.all, "listening-history", id, offset] as const,
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
    detail: (id: string) =>
      [...queryKeys.audiobooks.all, "detail", id] as const,
    authors: (search?: string) =>
      [...queryKeys.audiobooks.all, "authors", search] as const,
    narrators: (search?: string) =>
      [...queryKeys.audiobooks.all, "narrators", search] as const,
    publishers: (search?: string) =>
      [...queryKeys.audiobooks.all, "publishers", search] as const,
    genres: (search?: string) =>
      [...queryKeys.audiobooks.all, "genres", search] as const,
  },
  bookmarks: {
    all: ["bookmarks"] as const,
    list: (audiobookId: string) =>
      [...queryKeys.bookmarks.all, "list", audiobookId] as const,
    userBooks: (userId: string, offset?: number, limit?: number) =>
      [
        ...queryKeys.bookmarks.all,
        "user-books",
        userId,
        offset,
        limit,
      ] as const,
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
    authors: (search?: string) =>
      [...queryKeys.ebooks.all, "authors", search] as const,
    publishers: (search?: string) =>
      [...queryKeys.ebooks.all, "publishers", search] as const,
    genres: (search?: string) =>
      [...queryKeys.ebooks.all, "genres", search] as const,
  },
  comics: {
    all: ["comics"] as const,
    list: (filters?: {
      search?: string;
      publisher?: string;
      genreId?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.comics.all, "list", filters] as const,
    infinite: (filters?: {
      search?: string;
      publisher?: string;
      genreId?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.comics.all, "infinite", filters] as const,
    seriesDetail: (id: string) =>
      [...queryKeys.comics.all, "seriesDetail", id] as const,
    bookDetail: (id: string) =>
      [...queryKeys.comics.all, "bookDetail", id] as const,
    publishers: (search?: string) =>
      [...queryKeys.comics.all, "publishers", search] as const,
    genres: (search?: string) =>
      [...queryKeys.comics.all, "genres", search] as const,
    collections: (filters?: {
      search?: string;
      sortBy?: string;
      sortOrder?: string;
    }) => [...queryKeys.comics.all, "collections", filters] as const,
    collectionDetail: (id: string) =>
      [...queryKeys.comics.all, "collectionDetail", id] as const,
  },
  filesystem: {
    all: ["filesystem"] as const,
    browse: (path: string) =>
      [...queryKeys.filesystem.all, "browse", path] as const,
  },
  hardcover: {
    all: ["hardcover"] as const,
    status: () => [...queryKeys.hardcover.all, "status"] as const,
    link: (mediaType: "audiobook" | "ebook", mediaId: string) =>
      [...queryKeys.hardcover.all, "link", mediaType, mediaId] as const,
    search: (
      mediaType: "audiobook" | "ebook",
      mediaId: string,
      page?: number,
      customQuery?: string,
    ) =>
      [
        ...queryKeys.hardcover.all,
        "search",
        mediaType,
        mediaId,
        page,
        customQuery,
      ] as const,
    queueStatus: () => [...queryKeys.hardcover.all, "queue", "status"] as const,
  },
  comicvine: {
    all: ["comicvine"] as const,
    status: () => [...queryKeys.comicvine.all, "status"] as const,
    searchVolumes: (query: string, page?: number) =>
      [...queryKeys.comicvine.all, "search-volumes", query, page] as const,
    volumeForSeries: (seriesId: string, page?: number) =>
      [
        ...queryKeys.comicvine.all,
        "volume-for-series",
        seriesId,
        page,
      ] as const,
    volumeIssues: (cvVolumeId: number, page?: number) =>
      [...queryKeys.comicvine.all, "volume-issues", cvVolumeId, page] as const,
    issuesForBook: (bookId: string, page?: number) =>
      [...queryKeys.comicvine.all, "issues-for-book", bookId, page] as const,
    seriesLink: (seriesId: string) =>
      [...queryKeys.comicvine.all, "series-link", seriesId] as const,
    bookLink: (bookId: string) =>
      [...queryKeys.comicvine.all, "book-link", bookId] as const,
    queueStatus: () => [...queryKeys.comicvine.all, "queue", "status"] as const,
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
  tts: {
    all: ["tts"] as const,
    status: () => [...queryKeys.tts.all, "status"] as const,
    voices: () => [...queryKeys.tts.all, "voices"] as const,
    jobs: () => [...queryKeys.tts.all, "jobs"] as const,
  },
  tasks: {
    all: ["tasks"] as const,
    status: () => [...queryKeys.tasks.all, "status"] as const,
    import: () => [...queryKeys.tasks.all, "import"] as const,
    hardcover: () => [...queryKeys.tasks.all, "hardcover"] as const,
    comicvine: () => [...queryKeys.tasks.all, "comicvine"] as const,
    scan: () => [...queryKeys.tasks.all, "scan"] as const,
    rescan: () => [...queryKeys.tasks.all, "rescan"] as const,
    tts: () => [...queryKeys.tasks.all, "tts"] as const,
    goodreadsLink: () => [...queryKeys.tasks.all, "goodreadsLink"] as const,
  },
  importErrors: {
    all: ["importErrors"] as const,
    list: () => [...queryKeys.importErrors.all, "list"] as const,
    detail: (id: string) =>
      [...queryKeys.importErrors.all, "detail", id] as const,
  },
  restore: {
    all: ["restore"] as const,
    session: (sessionId: string) =>
      [...queryKeys.restore.all, "session", sessionId] as const,
    preview: (sessionId: string) =>
      [...queryKeys.restore.all, "preview", sessionId] as const,
    bookmarkUsers: () => [...queryKeys.restore.all, "bookmark-users"] as const,
    progress: (sessionId: string) =>
      [...queryKeys.restore.all, "progress", sessionId] as const,
  },
  requests: {
    all: ["requests"] as const,
    list: () => [...queryKeys.requests.all, "list"] as const,
    search: (query: string) =>
      [...queryKeys.requests.all, "search", query] as const,
    detail: (id: string) => [...queryKeys.requests.all, "detail", id] as const,
    autoApproveBudget: () =>
      [...queryKeys.requests.all, "auto-approve-budget"] as const,
    languages: () => [...queryKeys.requests.all, "languages"] as const,
  },
  adminRequests: {
    all: ["admin-requests"] as const,
    list: (status?: string, missingOnly?: boolean) =>
      [...queryKeys.adminRequests.all, "list", status, missingOnly] as const,
  },
  metadataGaps: {
    all: ["metadata-gaps"] as const,
    summary: (type: string) =>
      [...queryKeys.metadataGaps.all, "summary", type] as const,
    list: (filters: {
      type: string;
      missing?: string[];
      match?: string;
      search?: string;
      sort?: string;
      limit?: number;
      offset?: number;
    }) => [...queryKeys.metadataGaps.all, "list", filters] as const,
  },
  adminPeople: {
    all: ["admin-people"] as const,
    authors: (search?: string) =>
      [...queryKeys.adminPeople.all, "authors", search] as const,
    narrators: (search?: string) =>
      [...queryKeys.adminPeople.all, "narrators", search] as const,
  },
  audnexus: {
    all: ["audnexus"] as const,
    search: (title: string, author?: string, region?: string) =>
      [...queryKeys.audnexus.all, "search", title, author, region] as const,
    book: (asin: string, region?: string) =>
      [...queryKeys.audnexus.all, "book", asin, region] as const,
    chapters: (asin: string) =>
      [...queryKeys.audnexus.all, "chapters", asin] as const,
  },
  itunes: {
    all: ["itunes"] as const,
    search: (term: string, media: string, country?: string) =>
      [...queryKeys.itunes.all, "search", term, media, country] as const,
  },
  lists: {
    all: ["lists"] as const,
    list: () => [...queryKeys.lists.all, "list"] as const,
    detail: (id: string) => [...queryKeys.lists.all, "detail", id] as const,
    forItem: (
      itemType: "audiobook" | "ebook" | "comic_series",
      itemId: string,
    ) => [...queryKeys.lists.all, "for-item", itemType, itemId] as const,
    recent: (limit?: number) =>
      [...queryKeys.lists.all, "recent", limit] as const,
    top: (limit?: number) => [...queryKeys.lists.all, "top", limit] as const,
  },
  grFinder: {
    all: ["gr-finder"] as const,
    status: () => [...queryKeys.grFinder.all, "status"] as const,
    search: (query: string) =>
      [...queryKeys.grFinder.all, "search", query] as const,
    searchByMedia: (
      mediaType: "audiobook" | "ebook",
      mediaId: string,
      customQuery?: string,
    ) =>
      [
        ...queryKeys.grFinder.all,
        "search-by-media",
        mediaType,
        mediaId,
        customQuery,
      ] as const,
    link: (mediaType: "audiobook" | "ebook", mediaId: string) =>
      [...queryKeys.grFinder.all, "link", mediaType, mediaId] as const,
  },
  announcements: {
    all: ["announcements"] as const,
    active: () => [...queryKeys.announcements.all, "active"] as const,
    admin: () => [...queryKeys.announcements.all, "admin"] as const,
  },
  adminGenres: {
    all: ["admin-genres"] as const,
    list: () => [...queryKeys.adminGenres.all, "list"] as const,
  },
} as const;
