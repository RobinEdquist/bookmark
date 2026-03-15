/**
 * Users E2E Tests
 *
 * Tests the /users endpoints for user management, including admin-only
 * operations and self-service endpoints (/users/me/*).
 *
 * IMPORTANT: The first user signed up becomes admin.
 */

import { signUp, getSharedAdmin, type TestUser } from '../helpers/auth.helper';
import { api } from '../helpers/api.helper';

describe('Users (e2e)', () => {
  let admin: TestUser;
  let regularUser: TestUser;
  let userToDelete: TestUser;

  beforeAll(async () => {
    admin = await getSharedAdmin();
    regularUser = await signUp(
      'Users Regular',
      'users-regular@test.com',
      'password123',
    );
    userToDelete = await signUp(
      'Users Deletable',
      'users-deletable@test.com',
      'password123',
    );
  });

  // ===== Self Endpoints =====

  describe('GET /users/me', () => {
    it('should return current admin user', async () => {
      const { status, data } = await api.get('/users/me', admin.cookie);

      expect(status).toBe(200);
      expect(data.id).toBe(admin.id);
      expect(data.name).toBe('Shared Admin');
      expect(data.email).toBe('shared-admin@test.com');
      expect(data.role).toBe('admin');
      expect(data).toHaveProperty('permissions');
      expect(data.permissions.isAdmin).toBe(true);
      expect(data).toHaveProperty('blacklistedTags');
      expect(data).toHaveProperty('createdAt');
    });

    it('should return current regular user', async () => {
      const { status, data } = await api.get('/users/me', regularUser.cookie);

      expect(status).toBe(200);
      expect(data.id).toBe(regularUser.id);
      expect(data.name).toBe('Users Regular');
      expect(data.email).toBe('users-regular@test.com');
      expect(data.role).toBe('user');
      expect(data.permissions.isAdmin).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const { status } = await api.get('/users/me');

      expect(status).toBe(401);
    });
  });

  describe('GET /users/me/language', () => {
    it('should return default language', async () => {
      const { status, data } = await api.get(
        '/users/me/language',
        regularUser.cookie,
      );

      expect(status).toBe(200);
      expect(data).toHaveProperty('language');
      expect(typeof data.language).toBe('string');
    });
  });

  describe('PATCH /users/me/language', () => {
    it('should update language preference', async () => {
      const { status, data } = await api.patch(
        '/users/me/language',
        { language: 'sv' },
        regularUser.cookie,
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify the update persisted
      const { data: langData } = await api.get(
        '/users/me/language',
        regularUser.cookie,
      );
      expect(langData.language).toBe('sv');

      // Restore to default
      await api.patch(
        '/users/me/language',
        { language: 'en' },
        regularUser.cookie,
      );
    });

    it('should reject invalid language code', async () => {
      const { status } = await api.patch(
        '/users/me/language',
        { language: 'invalid' },
        regularUser.cookie,
      );

      expect(status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const { status } = await api.patch('/users/me/language', {
        language: 'en',
      });

      expect(status).toBe(401);
    });
  });

  describe('GET /users/me/theme', () => {
    it('should return theme preferences', async () => {
      const { status, data } = await api.get(
        '/users/me/theme',
        regularUser.cookie,
      );

      expect(status).toBe(200);
      expect(data).toHaveProperty('primaryColor');
      expect(data).toHaveProperty('surfaceColor');
      expect(typeof data.primaryColor).toBe('string');
      expect(typeof data.surfaceColor).toBe('string');
    });
  });

  describe('PATCH /users/me/theme', () => {
    it('should update theme preferences', async () => {
      const { status, data } = await api.patch(
        '/users/me/theme',
        { primaryColor: 'blue', surfaceColor: 'midnight' },
        regularUser.cookie,
      );

      expect(status).toBe(200);
      expect(data.success).toBe(true);

      // Verify the update persisted
      const { data: themeData } = await api.get(
        '/users/me/theme',
        regularUser.cookie,
      );
      expect(themeData.primaryColor).toBe('blue');
      expect(themeData.surfaceColor).toBe('midnight');
    });

    it('should reject invalid color values', async () => {
      const { status } = await api.patch(
        '/users/me/theme',
        { primaryColor: 'neon', surfaceColor: 'midnight' },
        regularUser.cookie,
      );

      expect(status).toBe(400);
    });

    it('should return 401 without authentication', async () => {
      const { status } = await api.patch('/users/me/theme', {
        primaryColor: 'blue',
        surfaceColor: 'midnight',
      });

      expect(status).toBe(401);
    });
  });

  describe('GET /users/me/permissions', () => {
    it('should return admin permissions', async () => {
      const { status, data } = await api.get(
        '/users/me/permissions',
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.isAdmin).toBe(true);
      expect(data).toHaveProperty('canEditMetadata');
      expect(data).toHaveProperty('canUpload');
      expect(data).toHaveProperty('canDelete');
      expect(data).toHaveProperty('canGenerateApiKeys');
      expect(data).toHaveProperty('canRequestContent');
    });

    it('should return regular user permissions', async () => {
      const { status, data } = await api.get(
        '/users/me/permissions',
        regularUser.cookie,
      );

      expect(status).toBe(200);
      expect(data.isAdmin).toBe(false);
    });
  });

  // ===== Admin Endpoints =====

  describe('GET /users', () => {
    it('should return list of users for admin', async () => {
      const { status, data } = await api.get('/users', admin.cookie);

      expect(status).toBe(200);
      expect(data).toHaveProperty('users');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.users)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(3); // admin + regular + deletable
      expect(data.users.length).toBeGreaterThanOrEqual(3);

      // Verify user shape
      const user = data.users[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('name');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('permissions');
      expect(user).toHaveProperty('createdAt');
    });

    it('should support search query', async () => {
      const { status, data } = await api.get(
        '/users?search=shared-admin',
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.users.length).toBeGreaterThanOrEqual(1);
      const found = data.users.some(
        (u: { email: string }) => u.email === 'shared-admin@test.com',
      );
      expect(found).toBe(true);
    });

    it('should return 403 for non-admin user', async () => {
      const { status } = await api.get('/users', regularUser.cookie);

      expect(status).toBe(403);
    });

    it('should return 401 without authentication', async () => {
      const { status } = await api.get('/users');

      expect(status).toBe(401);
    });
  });

  describe('GET /users/:id', () => {
    it('should return user detail for admin', async () => {
      const { status, data } = await api.get(
        `/users/${regularUser.id}`,
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.id).toBe(regularUser.id);
      expect(data.name).toBe('Users Regular');
      expect(data.email).toBe('users-regular@test.com');
      expect(data).toHaveProperty('permissions');
      expect(data).toHaveProperty('blacklistedTags');
    });

    it('should return 403 for non-admin user', async () => {
      const { status } = await api.get(
        `/users/${admin.id}`,
        regularUser.cookie,
      );

      expect(status).toBe(403);
    });

    it('should return 404 for non-existent user', async () => {
      const { status } = await api.get(
        '/users/00000000-0000-0000-0000-000000000000',
        admin.cookie,
      );

      expect(status).toBe(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('should update user name as admin', async () => {
      const { status, data } = await api.patch(
        `/users/${regularUser.id}`,
        { name: 'Updated Name' },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.name).toBe('Updated Name');

      // Restore original name
      await api.patch(
        `/users/${regularUser.id}`,
        { name: 'Users Regular' },
        admin.cookie,
      );
    });

    it('should update user permissions as admin', async () => {
      const { status, data } = await api.patch(
        `/users/${regularUser.id}`,
        { canEditMetadata: true, canUpload: true },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.permissions.canEditMetadata).toBe(true);
      expect(data.permissions.canUpload).toBe(true);

      // Restore
      await api.patch(
        `/users/${regularUser.id}`,
        { canEditMetadata: false, canUpload: false },
        admin.cookie,
      );
    });

    it('should return 403 for non-admin user', async () => {
      const { status } = await api.patch(
        `/users/${admin.id}`,
        { name: 'Hacked' },
        regularUser.cookie,
      );

      expect(status).toBe(403);
    });
  });

  describe('POST /users/:id/ban and POST /users/:id/unban', () => {
    it('should ban a user as admin', async () => {
      const { status, data } = await api.post(
        `/users/${userToDelete.id}/ban`,
        { reason: 'Test ban' },
        admin.cookie,
      );

      expect(status).toBe(201);
      expect(data.banned).toBe(true);
      expect(data.banReason).toBe('Test ban');
    });

    it('should unban a user as admin', async () => {
      const { status, data } = await api.post(
        `/users/${userToDelete.id}/unban`,
        {},
        admin.cookie,
      );

      expect(status).toBe(201);
      expect(data.banned).toBe(false);
    });

    it('should return 403 when non-admin tries to ban', async () => {
      const { status } = await api.post(
        `/users/${admin.id}/ban`,
        { reason: 'Nope' },
        regularUser.cookie,
      );

      expect(status).toBe(403);
    });
  });

  describe('DELETE /users/:id', () => {
    it('should return 403 for non-admin user', async () => {
      const { status } = await api.delete(
        `/users/${userToDelete.id}`,
        regularUser.cookie,
      );

      expect(status).toBe(403);
    });

    it('should delete a user as admin', async () => {
      const { status } = await api.delete(
        `/users/${userToDelete.id}`,
        admin.cookie,
      );

      expect(status).toBe(204);

      // Verify user is gone
      const { status: getStatus } = await api.get(
        `/users/${userToDelete.id}`,
        admin.cookie,
      );
      expect(getStatus).toBe(404);
    });
  });

  describe('POST /users (admin create)', () => {
    it('should create a new user as admin', async () => {
      const { status, data } = await api.post(
        '/users',
        {
          name: 'Created User',
          email: 'users-created@test.com',
          password: 'password123',
        },
        admin.cookie,
      );

      expect(status).toBe(201);
      expect(data.name).toBe('Created User');
      expect(data.email).toBe('users-created@test.com');
      expect(data.role).toBe('user');
      expect(data).toHaveProperty('permissions');
    });

    it('should return 403 for non-admin user', async () => {
      const { status } = await api.post(
        '/users',
        {
          name: 'Unauthorized',
          email: 'users-unauthorized@test.com',
          password: 'password123',
        },
        regularUser.cookie,
      );

      expect(status).toBe(403);
    });
  });
});
