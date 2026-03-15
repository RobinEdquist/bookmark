/**
 * Lists CRUD E2E Tests
 *
 * Tests list creation, update, deletion, and item management.
 */

import { signUp, getSharedAdmin, type TestUser } from '../helpers/auth.helper';
import { api } from '../helpers/api.helper';

describe('Lists (e2e)', () => {
  let admin: TestUser;
  let user: TestUser;

  beforeAll(async () => {
    admin = await getSharedAdmin();
    user = await signUp('Lists User', 'lists-user@test.com', 'password123');
  });

  describe('POST /lists', () => {
    it('should create a new list', async () => {
      const { status, data } = await api.post(
        '/lists',
        { name: 'My Favorites' },
        admin.cookie,
      );

      expect(status).toBe(201);
      expect(data).toMatchObject({
        name: 'My Favorites',
        isPublic: false,
      });
      expect(data).toHaveProperty('id');
    });

    it('should create a public list', async () => {
      const { status, data } = await api.post(
        '/lists',
        { name: 'Public List', isPublic: true },
        admin.cookie,
      );

      expect(status).toBe(201);
      expect(data).toMatchObject({
        name: 'Public List',
        isPublic: true,
      });
    });

    it('should return 401 without auth', async () => {
      const { status } = await api.post('/lists', { name: 'No Auth' });
      expect(status).toBe(401);
    });
  });

  describe('GET /lists', () => {
    it('should return lists grouped by ownership', async () => {
      const { status, data } = await api.get('/lists', admin.cookie);

      expect(status).toBe(200);
      expect(data).toHaveProperty('myLists');
      expect(data).toHaveProperty('publicLists');
      expect(Array.isArray(data.myLists)).toBe(true);
      // Admin created 2 lists above
      expect(data.myLists.length).toBeGreaterThanOrEqual(2);
    });

    it('should show public lists to other users', async () => {
      const { status, data } = await api.get('/lists', user.cookie);

      expect(status).toBe(200);
      // User has no own lists yet, but should see admin's public list
      expect(data.publicLists.length).toBeGreaterThanOrEqual(1);
      expect(
        data.publicLists.some(
          (l: { name: string }) => l.name === 'Public List',
        ),
      ).toBe(true);
    });
  });

  describe('GET /lists/:id', () => {
    let listId: string;

    beforeAll(async () => {
      const { data } = await api.post(
        '/lists',
        { name: 'Detail Test List' },
        admin.cookie,
      );
      listId = data.id;
    });

    it('should return list detail for owner', async () => {
      const { status, data } = await api.get(`/lists/${listId}`, admin.cookie);

      expect(status).toBe(200);
      expect(data).toMatchObject({
        id: listId,
        name: 'Detail Test List',
      });
      expect(data).toHaveProperty('items');
    });

    it('should return 403 for non-owner on private list', async () => {
      const { status } = await api.get(`/lists/${listId}`, user.cookie);
      expect(status).toBe(403);
    });

    it('should return 404 for non-existent list', async () => {
      const { status } = await api.get(
        '/lists/00000000-0000-0000-0000-000000000000',
        admin.cookie,
      );
      expect(status).toBe(404);
    });
  });

  describe('PATCH /lists/:id', () => {
    let listId: string;

    beforeAll(async () => {
      const { data } = await api.post(
        '/lists',
        { name: 'Update Me' },
        admin.cookie,
      );
      listId = data.id;
    });

    it('should update list name', async () => {
      const { status, data } = await api.patch(
        `/lists/${listId}`,
        { name: 'Updated Name' },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.name).toBe('Updated Name');
    });

    it('should update list visibility', async () => {
      const { status, data } = await api.patch(
        `/lists/${listId}`,
        { isPublic: true },
        admin.cookie,
      );

      expect(status).toBe(200);
      expect(data.isPublic).toBe(true);
    });

    it('should return 403 for non-owner', async () => {
      const { status } = await api.patch(
        `/lists/${listId}`,
        { name: 'Hacked' },
        user.cookie,
      );
      expect(status).toBe(403);
    });
  });

  describe('DELETE /lists/:id', () => {
    it('should delete a list', async () => {
      const { data: created } = await api.post(
        '/lists',
        { name: 'Delete Me' },
        admin.cookie,
      );

      const { status } = await api.delete(`/lists/${created.id}`, admin.cookie);
      expect(status).toBe(204);

      // Verify deleted
      const { status: getStatus } = await api.get(
        `/lists/${created.id}`,
        admin.cookie,
      );
      expect(getStatus).toBe(404);
    });

    it('should return 403 for non-owner', async () => {
      const { data: created } = await api.post(
        '/lists',
        { name: 'Not Yours' },
        admin.cookie,
      );

      const { status } = await api.delete(`/lists/${created.id}`, user.cookie);
      expect(status).toBe(403);
    });
  });

  describe('GET /lists/recent', () => {
    it('should return recently updated lists', async () => {
      const { status, data } = await api.get('/lists/recent', admin.cookie);

      expect(status).toBe(200);
      expect(data).toHaveProperty('lists');
      expect(Array.isArray(data.lists)).toBe(true);
    });
  });
});
