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
    controller: 'Progress',
    endpoints: [
      { method: 'GET', path: '/progress', expectedStatus: 401 },
      { method: 'GET', path: '/progress/stats', expectedStatus: 401 },
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
      { method: 'GET', path: '/ebooks/:id', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/:id/cover', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/:id/download', expectedStatus: 401 },
      { method: 'PATCH', path: '/ebooks/:id', expectedStatus: 401, body: {} },
      { method: 'DELETE', path: '/ebooks/:id', expectedStatus: 401 },
    ],
  },
  {
    controller: 'Series',
    endpoints: [
      { method: 'GET', path: '/series', expectedStatus: 401 },
      { method: 'GET', path: '/series/recently-updated', expectedStatus: 401 },
    ],
  },
  {
    controller: 'Library',
    endpoints: [
      { method: 'GET', path: '/library/stats', expectedStatus: 401 },
      { method: 'GET', path: '/library/availability', expectedStatus: 401 },
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
        path: '/admin/library-watcher/rescan',
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
    ],
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
    ],
  },
];

/**
 * OPDS endpoints - expect 401 with WWW-Authenticate header
 * Note: OPDS may return 404 if disabled in settings
 */
export const opdsEndpoints: ControllerEndpoints[] = [
  {
    controller: 'OPDS',
    endpoints: [
      { method: 'GET', path: '/ebooks/opds', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/opds/all', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/opds/authors', expectedStatus: 401 },
      { method: 'GET', path: '/ebooks/opds/series', expectedStatus: 401 },
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
