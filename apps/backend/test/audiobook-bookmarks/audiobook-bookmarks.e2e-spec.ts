/**
 * Audiobook Bookmarks E2E Tests
 *
 * Tests the bookmarks endpoints at the API-contract level (auth, response
 * shapes, error handling). The test database contains no audiobooks, so
 * create-success and idempotency paths are covered by the service unit spec
 * instead — creating a bookmark here must 404 on the missing audiobook.
 */

import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';
import { api } from '../helpers/api.helper';

describe('Audiobook Bookmarks (e2e)', () => {
  let admin: TestUser;
  const fakeAudiobookId = '00000000-0000-0000-0000-000000000001';
  const fakeBookmarkId = '00000000-0000-0000-0000-000000000002';

  beforeAll(async () => {
    admin = await getSharedAdmin();
  });

  describe('GET /audiobooks/:audiobookId/bookmarks', () => {
    it('should return empty array when no bookmarks exist', async () => {
      const { status, data } = await api.get(
        `/audiobooks/${fakeAudiobookId}/bookmarks`,
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('should return 401 without auth', async () => {
      const { status } = await api.get(
        `/audiobooks/${fakeAudiobookId}/bookmarks`,
      );
      expect(status).toBe(401);
    });
  });

  describe('POST /audiobooks/:audiobookId/bookmarks', () => {
    it('should return 404 when the audiobook does not exist', async () => {
      const { status } = await api.post(
        `/audiobooks/${fakeAudiobookId}/bookmarks`,
        { position: 60, note: 'Test' },
        admin.cookie,
      );

      expect(status).toBe(404);
    });

    it('should return 400 for a negative position', async () => {
      const { status } = await api.post(
        `/audiobooks/${fakeAudiobookId}/bookmarks`,
        { position: -1 },
        admin.cookie,
      );

      expect(status).toBe(400);
    });

    it('should return 400 for a non-integer position', async () => {
      const { status } = await api.post(
        `/audiobooks/${fakeAudiobookId}/bookmarks`,
        { position: 12.5 },
        admin.cookie,
      );

      expect(status).toBe(400);
    });

    it('should return 400 for unknown body fields', async () => {
      const { status } = await api.post(
        `/audiobooks/${fakeAudiobookId}/bookmarks`,
        { position: 60, unknownField: true },
        admin.cookie,
      );

      expect(status).toBe(400);
    });

    it('should return 400 for a non-uuid client id', async () => {
      const { status } = await api.post(
        `/audiobooks/${fakeAudiobookId}/bookmarks`,
        { id: 'not-a-uuid', position: 60 },
        admin.cookie,
      );

      expect(status).toBe(400);
    });
  });

  describe('PATCH /audiobooks/:audiobookId/bookmarks/:bookmarkId', () => {
    it('should return 400 for an empty body', async () => {
      const { status } = await api.patch(
        `/audiobooks/${fakeAudiobookId}/bookmarks/${fakeBookmarkId}`,
        {},
        admin.cookie,
      );

      expect(status).toBe(400);
    });

    it('should return 404 for a non-existent bookmark', async () => {
      const { status } = await api.patch(
        `/audiobooks/${fakeAudiobookId}/bookmarks/${fakeBookmarkId}`,
        { note: 'Updated' },
        admin.cookie,
      );

      expect(status).toBe(404);
    });
  });

  describe('DELETE /audiobooks/:audiobookId/bookmarks/:bookmarkId', () => {
    it('should return 404 for a non-existent bookmark', async () => {
      const { status } = await api.delete(
        `/audiobooks/${fakeAudiobookId}/bookmarks/${fakeBookmarkId}`,
        admin.cookie,
      );

      expect(status).toBe(404);
    });
  });

  describe('GET /user-profile/:id/bookmarks', () => {
    it('should return empty items for the current user', async () => {
      const { status, data } = await api.get(
        '/user-profile/me/bookmarks',
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data).toEqual({ items: [], total: 0 });
    });

    it('should return 401 without auth', async () => {
      const { status } = await api.get('/user-profile/me/bookmarks');
      expect(status).toBe(401);
    });
  });

  describe('GET /user-profile/:id/bookmarked-audiobooks', () => {
    it('should return empty items for the current user', async () => {
      const { status, data } = await api.get(
        '/user-profile/me/bookmarked-audiobooks',
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data).toEqual({ items: [], total: 0 });
    });

    it('should return 401 without auth', async () => {
      const { status } = await api.get(
        '/user-profile/me/bookmarked-audiobooks',
      );
      expect(status).toBe(401);
    });
  });
});
