/**
 * Settings E2E Tests
 *
 * Tests the /settings endpoints for public settings, authenticated settings,
 * and admin-only settings updates.
 *
 * IMPORTANT: The first user signed up becomes admin.
 */

import { signUp, getSharedAdmin, type TestUser } from '../helpers/auth.helper';
import { api } from '../helpers/api.helper';

describe('Settings (e2e)', () => {
  let admin: TestUser;
  let regularUser: TestUser;

  beforeAll(async () => {
    admin = await getSharedAdmin();
    regularUser = await signUp(
      'Settings User',
      'settings-user@test.com',
      'password123',
    );
  });

  describe('GET /settings/public', () => {
    it('should return public settings without authentication', async () => {
      const { status, data } = await api.get('/settings/public');

      expect(status).toBe(200);
      expect(data).toHaveProperty('signupsEnabled');
      expect(typeof data.signupsEnabled).toBe('boolean');
    });

    it('should only expose signupsEnabled in public settings', async () => {
      const { data } = await api.get('/settings/public');

      // Public settings should NOT contain sensitive fields
      expect(data).not.toHaveProperty('audiobookLibraryPath');
      expect(data).not.toHaveProperty('ebookLibraryPath');
      expect(data).not.toHaveProperty('metadataPriority');
      expect(data).not.toHaveProperty('emailPasswordEnabled');
    });
  });

  describe('GET /settings/auth-config', () => {
    it('should return auth config without authentication', async () => {
      const { status, data } = await api.get('/settings/auth-config');

      expect(status).toBe(200);
      expect(data).toHaveProperty('emailPasswordEnabled');
      expect(data).toHaveProperty('oidcEnabled');
      expect(typeof data.emailPasswordEnabled).toBe('boolean');
      expect(typeof data.oidcEnabled).toBe('boolean');
    });
  });

  describe('GET /settings/setup-status', () => {
    it('should return setup as completed since users exist', async () => {
      const { status, data } = await api.get('/settings/setup-status');

      expect(status).toBe(200);
      expect(data).toEqual({ setupCompleted: true });
    });
  });

  describe('GET /settings', () => {
    it('should return all settings for authenticated user', async () => {
      const { status, data } = await api.get('/settings', admin.cookie);

      expect(status).toBe(200);
      expect(data).toHaveProperty('signupsEnabled');
      expect(data).toHaveProperty('audiobookLibraryPath');
      expect(data).toHaveProperty('ebookLibraryPath');
      expect(data).toHaveProperty('metadataPriority');
      expect(data).toHaveProperty('opdsEnabled');
      expect(data).toHaveProperty('emailPasswordEnabled');
      expect(data).toHaveProperty('oidcButtonText');
      expect(data).toHaveProperty('requestsEnabled');
      expect(data).toHaveProperty('defaultCanEditMetadata');
      expect(data).toHaveProperty('defaultCanUpload');
      expect(data).toHaveProperty('defaultCanDelete');
      expect(data).toHaveProperty('defaultCanGenerateApiKeys');
      expect(data).toHaveProperty('defaultCanRequestContent');
      expect(data).toHaveProperty('trackerClientConfigured');
      expect(data).toHaveProperty('grFinderConfigured');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
    });

    it('should return 401 without authentication', async () => {
      const { status } = await api.get('/settings');

      expect(status).toBe(401);
    });

    it('should return settings for non-admin user too', async () => {
      const { status, data } = await api.get('/settings', regularUser.cookie);

      expect(status).toBe(200);
      expect(data).toHaveProperty('signupsEnabled');
    });
  });

  describe('PATCH /settings', () => {
    it('should update settings as admin', async () => {
      const { status, data } = await api.patch(
        '/settings',
        { signupsEnabled: false },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.signupsEnabled).toBe(false);
    });

    it('should persist updated settings', async () => {
      // First update
      await api.patch('/settings', { signupsEnabled: false }, admin.cookie);

      // Then read back
      const { data } = await api.get('/settings', admin.cookie);
      expect(data.signupsEnabled).toBe(false);

      // Restore
      await api.patch('/settings', { signupsEnabled: true }, admin.cookie);
    });

    it('should return 403 for non-admin user', async () => {
      const { status } = await api.patch(
        '/settings',
        { signupsEnabled: false },
        regularUser.cookie,
      );

      expect(status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const { status } = await api.patch('/settings', {
        signupsEnabled: false,
      });

      expect(status).toBe(401);
    });

    it('should return 400 when no settings are provided', async () => {
      const { status } = await api.patch('/settings', {}, admin.cookie);

      expect(status).toBe(400);
    });

    it('should update metadata priority', async () => {
      const metadataPriority = {
        title: ['manual', 'embedded'],
        author: ['embedded', 'manual'],
      };

      const { status, data } = await api.patch(
        '/settings',
        { metadataPriority },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.metadataPriority).toBeDefined();
      // The returned priority may be merged with defaults, but our specified
      // sources should be in the correct order at the start
      expect(data.metadataPriority.title[0]).toBe('manual');
      expect(data.metadataPriority.title[1]).toBe('embedded');
      expect(data.metadataPriority.author[0]).toBe('embedded');
      expect(data.metadataPriority.author[1]).toBe('manual');
    });

    it('should update library path to a valid directory', async () => {
      // /tmp always exists and is readable
      const { status, data } = await api.patch(
        '/settings',
        { audiobookLibraryPath: '/tmp' },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.audiobookLibraryPath).toBe('/tmp');
    });

    it('should reject an invalid library path', async () => {
      const { status } = await api.patch(
        '/settings',
        { audiobookLibraryPath: '/nonexistent/path/that/does/not/exist' },
        admin.cookie,
      );

      expect(status).toBe(400);
    });

    it('should allow clearing library path with null', async () => {
      const { status, data } = await api.patch(
        '/settings',
        { audiobookLibraryPath: null },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.audiobookLibraryPath).toBeNull();
    });

    it('should update boolean feature flags', async () => {
      const { status, data } = await api.patch(
        '/settings',
        {
          opdsEnabled: true,
          requestsEnabled: true,
          defaultCanEditMetadata: true,
          defaultCanUpload: true,
        },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.opdsEnabled).toBe(true);
      expect(data.requestsEnabled).toBe(true);
      expect(data.defaultCanEditMetadata).toBe(true);
      expect(data.defaultCanUpload).toBe(true);

      // Restore defaults
      await api.patch(
        '/settings',
        {
          opdsEnabled: false,
          requestsEnabled: false,
          defaultCanEditMetadata: false,
          defaultCanUpload: false,
        },
        admin.cookie,
      );
    });
  });
});
