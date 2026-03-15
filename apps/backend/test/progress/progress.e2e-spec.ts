/**
 * Progress Tracking E2E Tests
 *
 * Tests listening progress endpoints.
 * Note: Progress requires real audiobook IDs in the database. Since the DB is
 * empty (no audiobooks), we test the API contract (auth, response shapes) and
 * error handling. The updateProgress endpoint does an upsert so it works
 * even without a matching audiobook row in some DB configurations.
 */

import { getSharedAdmin, type TestUser } from '../helpers/auth.helper';
import { api } from '../helpers/api.helper';

describe('Progress (e2e)', () => {
  let admin: TestUser;
  const fakeAudiobookId = '00000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    admin = await getSharedAdmin();
  });

  describe('GET /progress', () => {
    it('should return empty array when no progress exists', async () => {
      const { status, data } = await api.get('/progress', admin.cookie);

      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(0);
    });

    it('should return 401 without auth', async () => {
      const { status } = await api.get('/progress');
      expect(status).toBe(401);
    });
  });

  describe('GET /progress/stats', () => {
    it('should return stats structure with zero values', async () => {
      const { status, data } = await api.get('/progress/stats', admin.cookie);

      expect(status).toBe(200);
      expect(data).toHaveProperty('today');
      expect(data).toHaveProperty('thisWeek');
      expect(data).toHaveProperty('thisMonth');
      expect(data).toHaveProperty('allTime');
      expect(data.today).toHaveProperty('durationSeconds');
      expect(data.allTime).toHaveProperty('audiobooksStarted');
      expect(data.allTime).toHaveProperty('audiobooksCompleted');
    });
  });

  describe('GET /progress/listening-stats', () => {
    it('should return mobile listening stats structure', async () => {
      const { status, data } = await api.get(
        '/progress/listening-stats',
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data).toHaveProperty('days');
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('dayOfWeek');
      expect(data).toHaveProperty('totalTime');
    });
  });

  describe('GET /progress/:audiobookId', () => {
    it('should return default progress for non-existent audiobook', async () => {
      const { status, data } = await api.get(
        `/progress/${fakeAudiobookId}`,
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data).toMatchObject({
        audiobookId: fakeAudiobookId,
        position: 0,
        completed: false,
        completedAt: null,
      });
    });
  });

  describe('POST /progress/:audiobookId/session', () => {
    it('should return 401 without auth', async () => {
      const { status } = await api.post(
        `/progress/${fakeAudiobookId}/session`,
        {
          startedAt: new Date().toISOString(),
          endedAt: new Date().toISOString(),
          durationSeconds: 60,
        },
      );

      expect(status).toBe(401);
    });
  });

  describe('DELETE /progress/:audiobookId', () => {
    it('should return 404 for non-existent progress', async () => {
      const { status } = await api.delete(
        `/progress/${fakeAudiobookId}`,
        admin.cookie,
      );

      expect(status).toBe(404);
    });
  });

  describe('POST /progress/:audiobookId/hide', () => {
    it('should return 404 for non-existent progress', async () => {
      const { status } = await api.post(
        `/progress/${fakeAudiobookId}/hide`,
        {},
        admin.cookie,
      );

      expect(status).toBe(404);
    });
  });
});
