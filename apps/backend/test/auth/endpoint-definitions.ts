/**
 * Endpoint definitions for authentication verification tests.
 * This file serves as both test configuration and security documentation.
 */

export interface EndpointDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: object;
  expectedStatus: 401 | 403;
  description?: string;
}

export interface ControllerEndpoints {
  controller: string;
  endpoints: EndpointDefinition[];
}

/**
 * Endpoints protected by AuthGuard - expect 401 Unauthorized
 */
export const authGuardEndpoints: ControllerEndpoints[] = [
  {
    controller: 'Audiobook Bookmarks',
    endpoints: [
      {
        method: 'GET',
        path: '/audiobooks/:audiobookId/bookmarks',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/audiobooks/:audiobookId/bookmarks',
        expectedStatus: 401,
        body: { position: 0 },
      },
      {
        method: 'PATCH',
        path: '/audiobooks/:audiobookId/bookmarks/:bookmarkId',
        expectedStatus: 401,
        body: { position: 0 },
      },
      {
        method: 'DELETE',
        path: '/audiobooks/:audiobookId/bookmarks/:bookmarkId',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'User Profile',
    endpoints: [
      {
        method: 'GET',
        path: '/user-profile/:id/stats',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/user-profile/:id/activity',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/user-profile/:id/library-progress',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/user-profile/:id/listening-history',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/user-profile/:id/bookmarks',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Progress',
    endpoints: [
      { method: 'GET', path: '/progress', expectedStatus: 401 },
      { method: 'GET', path: '/progress/stats', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/progress/listening-stats',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/progress/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'PATCH',
        path: '/progress/:audiobookId',
        expectedStatus: 401,
        body: { position: 0 },
      },
      {
        method: 'POST',
        path: '/progress/:audiobookId/session',
        expectedStatus: 401,
        body: { startedAt: '', endedAt: '', durationSeconds: 0 },
      },
      {
        method: 'DELETE',
        path: '/progress/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/progress/:audiobookId/hide',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Audnexus',
    endpoints: [
      { method: 'GET', path: '/audnexus/search', expectedStatus: 401 },
      { method: 'GET', path: '/audnexus/book/:asin', expectedStatus: 401 },
      { method: 'GET', path: '/audnexus/chapters/:asin', expectedStatus: 401 },
    ],
  },
  {
    controller: 'Tasks',
    endpoints: [{ method: 'GET', path: '/tasks/status', expectedStatus: 401 }],
  },
  {
    controller: 'Audiobooks',
    endpoints: [
      { method: 'GET', path: '/audiobooks', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/authors', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/narrators', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/publishers', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/genres', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/tags', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/series', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/:id', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/:id/cover', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/:id/stream', expectedStatus: 401 },
      { method: 'GET', path: '/audiobooks/:id/download', expectedStatus: 401 },
      {
        method: 'PATCH',
        path: '/audiobooks/:id',
        expectedStatus: 401,
        body: {},
      },
      {
        method: 'POST',
        path: '/audiobooks/:id/refresh-chapters',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/audiobooks/:id/chapters/import',
        expectedStatus: 401,
        body: { asin: 'test', chapters: [] },
      },
      {
        method: 'POST',
        path: '/audiobooks/:id/cover',
        expectedStatus: 401,
      },
      { method: 'DELETE', path: '/audiobooks/:id', expectedStatus: 401 },
    ],
  },
  {
    controller: 'Ebooks',
    endpoints: [
      { method: 'GET', path: '/ebooks', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/authors', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/publishers', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/series', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/genres', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/:id', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/:id/cover', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/:id/download', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/:id/stream', expectedStatus: 401 },
      { method: 'PATCH', path: '/ebooks/:id', expectedStatus: 401, body: {} },
      { method: 'POST', path: '/ebooks/:id/cover', expectedStatus: 401 },
      { method: 'DELETE', path: '/ebooks/:id', expectedStatus: 401 },
    ],
  },
  {
    controller: 'Series',
    endpoints: [
      { method: 'GET', path: '/series', expectedStatus: 401 },
      { method: 'GET', path: '/series/recently-updated', expectedStatus: 401 },
      { method: 'GET', path: '/series/:id', expectedStatus: 401 },
      { method: 'PATCH', path: '/series/:id', expectedStatus: 401 },
    ],
  },
  {
    controller: 'Library',
    endpoints: [
      { method: 'GET', path: '/library/stats', expectedStatus: 401 },
      { method: 'GET', path: '/library/availability', expectedStatus: 401 },
      { method: 'GET', path: '/library/search', expectedStatus: 401 },
    ],
  },
  {
    controller: 'People',
    endpoints: [
      { method: 'GET', path: '/people/:id/image', expectedStatus: 401 },
    ],
  },
  {
    controller: 'ApiKeys (user)',
    endpoints: [
      { method: 'GET', path: '/api-keys/me', expectedStatus: 401 },
      { method: 'POST', path: '/api-keys', expectedStatus: 401, body: {} },
      { method: 'DELETE', path: '/api-keys/:id', expectedStatus: 401 },
    ],
  },
  {
    controller: 'iTunes',
    endpoints: [{ method: 'GET', path: '/itunes/search', expectedStatus: 401 }],
  },
  {
    controller: 'Ebook Progress',
    endpoints: [
      { method: 'GET', path: '/ebook-progress', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/ebook-progress/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'PATCH',
        path: '/ebook-progress/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/ebook-progress/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/ebook-progress/:ebookId/hide',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Comic Progress',
    endpoints: [
      {
        method: 'GET',
        path: '/comic-progress/on-deck',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comic-progress/:bookId',
        expectedStatus: 401,
      },
      {
        method: 'PATCH',
        path: '/comic-progress/:bookId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/comic-progress/:bookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/comic-progress/:bookId/hide',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Comics',
    endpoints: [
      { method: 'GET', path: '/comics/series', expectedStatus: 401 },
      { method: 'POST', path: '/comics/series', expectedStatus: 401 },
      { method: 'POST', path: '/comics/series/merge', expectedStatus: 401 },
      { method: 'GET', path: '/comics/collections', expectedStatus: 401 },
      { method: 'POST', path: '/comics/collections', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/comics/collections/:id',
        expectedStatus: 401,
      },
      {
        method: 'PATCH',
        path: '/comics/collections/:id',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/comics/collections/:id',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/comics/collections/:id/series',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/comics/collections/:id/series/:seriesId',
        expectedStatus: 401,
      },
      {
        method: 'PATCH',
        path: '/comics/collections/:id/order',
        expectedStatus: 401,
      },
      { method: 'GET', path: '/comics/publishers', expectedStatus: 401 },
      { method: 'GET', path: '/comics/genres', expectedStatus: 401 },
      { method: 'GET', path: '/comics/series/:id', expectedStatus: 401 },
      { method: 'PATCH', path: '/comics/series/:id', expectedStatus: 401 },
      { method: 'DELETE', path: '/comics/series/:id', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/comics/series/:id/cover',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/series/:id/cover',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/series/:id/download',
        expectedStatus: 401,
      },
      { method: 'GET', path: '/comics/books/:id', expectedStatus: 401 },
      { method: 'PATCH', path: '/comics/books/:id', expectedStatus: 401 },
      { method: 'DELETE', path: '/comics/books/:id', expectedStatus: 401 },
      { method: 'PATCH', path: '/comics/books/batch', expectedStatus: 401 },
      { method: 'POST', path: '/comics/books/move', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/comics/books/:id/cover',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/books/:id/cover',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/books/:id/download',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Lists',
    endpoints: [
      { method: 'GET', path: '/lists', expectedStatus: 401 },
      { method: 'POST', path: '/lists', expectedStatus: 401 },
      { method: 'GET', path: '/lists/for-item', expectedStatus: 401 },
      { method: 'GET', path: '/lists/recent', expectedStatus: 401 },
      { method: 'GET', path: '/lists/top', expectedStatus: 401 },
      { method: 'GET', path: '/lists/:id', expectedStatus: 401 },
      { method: 'PATCH', path: '/lists/:id', expectedStatus: 401 },
      { method: 'DELETE', path: '/lists/:id', expectedStatus: 401 },
      { method: 'POST', path: '/lists/:id/items', expectedStatus: 401 },
      {
        method: 'DELETE',
        path: '/lists/:id/items/:itemId',
        expectedStatus: 401,
      },
      {
        method: 'PATCH',
        path: '/lists/:id/items/reorder',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Announcements',
    endpoints: [
      { method: 'GET', path: '/announcements/active', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/announcements/:id/dismiss',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'TTS',
    endpoints: [
      { method: 'GET', path: '/tts/status', expectedStatus: 401 },
      { method: 'POST', path: '/tts/config', expectedStatus: 401 },
      { method: 'POST', path: '/tts/validate', expectedStatus: 401 },
      { method: 'GET', path: '/tts/voices', expectedStatus: 401 },
      { method: 'POST', path: '/tts/preview', expectedStatus: 401 },
      { method: 'POST', path: '/tts/jobs', expectedStatus: 401 },
      { method: 'GET', path: '/tts/jobs', expectedStatus: 401 },
      { method: 'POST', path: '/tts/jobs/:id/cancel', expectedStatus: 401 },
      { method: 'POST', path: '/tts/jobs/:id/retry', expectedStatus: 401 },
      { method: 'DELETE', path: '/tts/jobs/:id', expectedStatus: 401 },
    ],
  },
  {
    controller: 'Version',
    endpoints: [{ method: 'GET', path: '/version', expectedStatus: 401 }],
  },
];

/**
 * Endpoints protected by AdminGuard - expect 401 Unauthorized
 * Note: Global auth middleware runs first, returning 401 if not authenticated.
 * 403 would only be returned if authenticated but not admin.
 */
export const adminGuardEndpoints: ControllerEndpoints[] = [
  {
    controller: 'Users (admin)',
    endpoints: [
      { method: 'GET', path: '/users', expectedStatus: 401 },
      { method: 'GET', path: '/users/:id', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/users',
        expectedStatus: 401,
        body: { email: 'test@test.com', password: 'test', name: 'test' },
      },
      { method: 'PATCH', path: '/users/:id', expectedStatus: 401, body: {} },
      { method: 'POST', path: '/users/:id/ban', expectedStatus: 401, body: {} },
      { method: 'POST', path: '/users/:id/unban', expectedStatus: 401 },
      { method: 'DELETE', path: '/users/:id', expectedStatus: 401 },
    ],
  },
  {
    controller: 'ApiKeys (admin)',
    endpoints: [
      { method: 'GET', path: '/api-keys/user/:userId', expectedStatus: 401 },
      {
        method: 'DELETE',
        path: '/api-keys/user/:userId/:keyId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/api-keys/user/:userId',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'ImportErrors',
    endpoints: [
      { method: 'GET', path: '/admin/import-errors', expectedStatus: 401 },
      { method: 'GET', path: '/admin/import-errors/:id', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/admin/import-errors/:id/retry',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/import-errors/:id/ignore',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/admin/import-errors/:id',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'LibraryWatcher',
    endpoints: [
      {
        method: 'GET',
        path: '/admin/library-watcher/status',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/library-watcher/scan',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/library-watcher/scan-ebooks',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/library-watcher/scan-comics',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/library-watcher/rescan',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/library-watcher/rescan-comics',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/admin/library-watcher/rescan-status',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Restore',
    endpoints: [
      {
        method: 'POST',
        path: '/admin/restore/upload',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/admin/restore/sessions/:id',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/admin/restore/sessions/:id',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/restore/sessions/:id/library',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/restore/sessions/:id/path-mappings',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/restore/sessions/:id/user-mappings',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/restore/sessions/:id/options',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/admin/restore/sessions/:id/preview',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/restore/sessions/:id/execute',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/admin/restore/bookmark-users',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'RequestsAdmin',
    endpoints: [
      { method: 'GET', path: '/admin/requests', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/admin/requests/:id/approve',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/requests/:id/reject',
        expectedStatus: 401,
        body: {},
      },
      {
        method: 'DELETE',
        path: '/admin/requests/:id',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'People Admin',
    endpoints: [
      { method: 'GET', path: '/admin/people/authors', expectedStatus: 401 },
      { method: 'GET', path: '/admin/people/narrators', expectedStatus: 401 },
      { method: 'PATCH', path: '/admin/people/:id', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/admin/people/:id/merge/:targetId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/admin/people/:id/split',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Announcements Admin',
    endpoints: [
      { method: 'GET', path: '/admin/announcements', expectedStatus: 401 },
      { method: 'POST', path: '/admin/announcements', expectedStatus: 401 },
      {
        method: 'PATCH',
        path: '/admin/announcements/:id',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/admin/announcements/:id',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Genres Admin',
    endpoints: [
      { method: 'GET', path: '/admin/genres', expectedStatus: 401 },
      { method: 'PATCH', path: '/admin/genres/:id', expectedStatus: 401 },
      { method: 'DELETE', path: '/admin/genres/:id', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/admin/genres/:id/merge/:targetId',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Stats',
    endpoints: [{ method: 'GET', path: '/stats', expectedStatus: 401 }],
  },
];

/**
 * Endpoints protected by RolesGuard with @Roles('admin') - expect 401 Unauthorized
 * Note: Global auth middleware runs first, returning 401 if not authenticated.
 * 403 would only be returned if authenticated but not admin.
 */
export const rolesGuardAdminEndpoints: ControllerEndpoints[] = [
  {
    controller: 'Hardcover',
    endpoints: [
      { method: 'GET', path: '/hardcover/status', expectedStatus: 401 },
      { method: 'POST', path: '/hardcover/auto-sync', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/hardcover/validate',
        expectedStatus: 401,
        body: { apiKey: 'test' },
      },
      { method: 'POST', path: '/hardcover/disconnect', expectedStatus: 401 },
      { method: 'GET', path: '/hardcover/search', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/hardcover/search/audiobook/:id',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/hardcover/link/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/hardcover/link/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/hardcover/link/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/hardcover/search/ebook/:id',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/hardcover/ebook-link/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/hardcover/ebook-link/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/hardcover/ebook-link/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/hardcover/queue/status',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/hardcover/queue/failed/:id',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/hardcover/queue-all-unlinked/audiobooks',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/hardcover/queue-all-unlinked/ebooks',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Filesystem',
    endpoints: [
      { method: 'GET', path: '/filesystem/browse', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/filesystem/create-directory',
        expectedStatus: 401,
        body: { path: '/test' },
      },
    ],
  },
  {
    controller: 'AppSettings (admin)',
    endpoints: [
      { method: 'PATCH', path: '/settings', expectedStatus: 401, body: {} },
    ],
  },
  {
    controller: 'ComicVine',
    endpoints: [
      { method: 'GET', path: '/comicvine/status', expectedStatus: 401 },
      { method: 'POST', path: '/comicvine/validate', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/comicvine/disconnect',
        expectedStatus: 401,
      },
      { method: 'POST', path: '/comicvine/auto-sync', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/comicvine/search/volumes',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comicvine/search/volume-for-series/:seriesId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comicvine/volume/:cvVolumeId/issues',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comicvine/link/series/:seriesId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/comicvine/link/series/:seriesId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/comicvine/link/series/:seriesId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comicvine/link/book/:bookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/comicvine/link/book/:bookId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/comicvine/link/book/:bookId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comicvine/search/issue-for-book/:bookId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comicvine/queue/status',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/comicvine/queue/:id',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/comicvine/queue-all-unlinked/series',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Goodreads Finder',
    endpoints: [
      { method: 'GET', path: '/gr-finder/status', expectedStatus: 401 },
      { method: 'GET', path: '/gr-finder/search', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/gr-finder/search/audiobook/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/gr-finder/search/ebook/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/gr-finder/book/:goodreadsId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/gr-finder/link/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/gr-finder/link/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/gr-finder/link/:audiobookId',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/gr-finder/link-jobs',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/gr-finder/link-jobs/failed',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/gr-finder/ebook-link/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'POST',
        path: '/gr-finder/ebook-link/:ebookId',
        expectedStatus: 401,
      },
      {
        method: 'DELETE',
        path: '/gr-finder/ebook-link/:ebookId',
        expectedStatus: 401,
      },
    ],
  },
];

/**
 * Endpoints protected by CanRequestGuard - expect 401 Unauthorized
 * Note: Global auth middleware runs first, returning 401 if not authenticated.
 * 403 would only be returned if authenticated but lacking the canRequest permission.
 */
export const canRequestGuardEndpoints: ControllerEndpoints[] = [
  {
    controller: 'Requests',
    endpoints: [
      { method: 'GET', path: '/requests/cover/:id', expectedStatus: 401 },
      { method: 'GET', path: '/requests/languages', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/requests/search',
        expectedStatus: 401,
        body: { query: 'test' },
      },
      { method: 'GET', path: '/requests', expectedStatus: 401 },
      {
        method: 'POST',
        path: '/requests',
        expectedStatus: 401,
        body: { bookId: 'test' },
      },
      { method: 'POST', path: '/requests/:id/support', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/requests/auto-approve-budget',
        expectedStatus: 401,
      },
    ],
  },
];

/**
 * OPDS endpoints - expect 401 with WWW-Authenticate header
 * Note: OPDS may return 404 if disabled in settings
 */
export const opdsEndpoints: ControllerEndpoints[] = [
  {
    controller: 'Ebooks OPDS',
    endpoints: [
      { method: 'GET', path: '/ebooks/opds', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/opds/all', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/opds/authors', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/ebooks/opds/authors/:id',
        expectedStatus: 401,
      },
      { method: 'GET', path: '/ebooks/opds/series', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/ebooks/opds/series/:id',
        expectedStatus: 401,
      },
    ],
  },
  {
    controller: 'Comics OPDS',
    endpoints: [
      { method: 'GET', path: '/comics/opds', expectedStatus: 401 },
      { method: 'GET', path: '/comics/opds/series', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/comics/opds/series/:id',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/opds/publishers',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/opds/publishers/:publisher',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/opds/collections',
        expectedStatus: 401,
      },
      {
        method: 'GET',
        path: '/comics/opds/collections/:id',
        expectedStatus: 401,
      },
      { method: 'GET', path: '/comics/opds/on-deck', expectedStatus: 401 },
      { method: 'GET', path: '/comics/opds/recent', expectedStatus: 401 },
      {
        method: 'GET',
        path: '/comics/opds/books/:id/pages/:page',
        expectedStatus: 401,
      },
    ],
  },
];

/**
 * User self-service endpoints protected by session - expect 401 Unauthorized
 */
export const userSelfEndpoints: ControllerEndpoints[] = [
  {
    controller: 'Users (self)',
    endpoints: [
      { method: 'GET', path: '/users/me', expectedStatus: 401 },
      { method: 'GET', path: '/users/session', expectedStatus: 401 },
      { method: 'GET', path: '/users/me/permissions', expectedStatus: 401 },
      { method: 'GET', path: '/users/me/language', expectedStatus: 401 },
      {
        method: 'PATCH',
        path: '/users/me/language',
        expectedStatus: 401,
        body: { language: 'en' },
      },
      { method: 'GET', path: '/users/me/theme', expectedStatus: 401 },
      {
        method: 'PATCH',
        path: '/users/me/theme',
        expectedStatus: 401,
        body: { primaryColor: 'orange', surfaceColor: 'espresso' },
      },
    ],
  },
  {
    controller: 'AppSettings (authenticated)',
    endpoints: [{ method: 'GET', path: '/settings', expectedStatus: 401 }],
  },
];

/**
 * Public endpoints - should NOT return 401 or 403
 * Note: expectedStatus is a placeholder - the test checks for NOT 401/403
 */
export const publicEndpoints: EndpointDefinition[] = [
  { method: 'GET', path: '/health', expectedStatus: 401 }, // Placeholder, will check for NOT 401/403
  { method: 'GET', path: '/settings/public', expectedStatus: 401 },
  { method: 'GET', path: '/settings/auth-config', expectedStatus: 401 },
  { method: 'GET', path: '/settings/setup-status', expectedStatus: 401 },
  // Mobile OIDC handoff: browser redirect targets, never JSON 401s.
  // Without the required `state` param these answer 400; with it they 302.
  { method: 'GET', path: '/mobile-auth/start', expectedStatus: 401 },
  { method: 'GET', path: '/mobile-auth/complete', expectedStatus: 401 },
];

/**
 * All protected endpoints combined for easy iteration
 */
export const allProtectedEndpoints: ControllerEndpoints[] = [
  ...authGuardEndpoints,
  ...adminGuardEndpoints,
  ...rolesGuardAdminEndpoints,
  ...canRequestGuardEndpoints,
  ...userSelfEndpoints,
];
