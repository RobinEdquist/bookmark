import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { UsersService } from './users.service';

jest.mock('better-auth/crypto', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed-password'),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const cryptoModule = require('crypto');
cryptoModule.randomUUID = jest
  .fn()
  .mockReturnValueOnce('generated-user-id')
  .mockReturnValueOnce('generated-account-id');

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  image: null,
  language: 'en',
  primaryColor: 'orange',
  surfaceColor: 'espresso',
  role: 'user',
  banned: false,
  banReason: null as string | null,
  banExpires: null as Date | null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockAdminUser = {
  ...mockUser,
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
};

function chainable(resolved: unknown = []) {
  const chain: Record<string, jest.Mock> = {};
  chain.from = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.orderBy = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockResolvedValue(resolved);
  // Make the chain itself thenable so `await db.select().from().where()` resolves
  (chain as any).then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(resolved).then(resolve, reject);
  return chain;
}

function createMockDb() {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  } as any;
}

/**
 * Helper: configure db.insert() to return a chainable with .values().onConflictDoUpdate()
 */
function setupInsert(db: any) {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = jest.fn().mockResolvedValue(undefined);
  (chain as any).then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(undefined).then(resolve, reject);
  db.insert.mockReturnValue(chain);
  return chain;
}

/**
 * Helper: configure db.update() to return a chainable with .set().where()
 */
function setupUpdate(db: any) {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockResolvedValue(undefined);
  (chain as any).then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(undefined).then(resolve, reject);
  db.update.mockReturnValue(chain);
  return chain;
}

/**
 * Helper: configure db.delete() to return a chainable with .where()
 */
function setupDelete(db: any) {
  const chain: Record<string, jest.Mock> = {};
  chain.where = jest.fn().mockResolvedValue(undefined);
  (chain as any).then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(undefined).then(resolve, reject);
  db.delete.mockReturnValue(chain);
  return chain;
}

/**
 * Many methods call findById or toUserResponse internally, which does multiple selects.
 * toUserResponse uses Promise.all for getPermissions, getBlacklistedTags, getApiKeyInfo.
 * The call order to db.select is:
 *   1. user select (for findById)
 *   2. role select (getPermissions - first synchronous select)
 *   3. blacklisted tags select (getBlacklistedTags - synchronous select)
 *   4. api key select (getApiKeyInfo - synchronous select)
 *   5. permissions row select (getPermissions - second select after awaiting role, non-admin only)
 */
function setupToUserResponse(
  db: any,
  user: typeof mockUser,
  perms?: Record<string, boolean>,
  tags: { tagId: string }[] = [],
  apiKeyResult: unknown[] = [],
) {
  const isAdmin = user.role === 'admin';
  const permRow = perms
    ? {
        userId: user.id,
        canEditMetadata: perms.canEditMetadata ?? false,
        canUpload: perms.canUpload ?? false,
        canDelete: perms.canDelete ?? false,
        canGenerateApiKeys: perms.canGenerateApiKeys ?? false,
        canRequestContent: perms.canRequestContent ?? false,
      }
    : undefined;

  // 1. findById -> select user
  db.select.mockReturnValueOnce(chainable([user]));
  // 2. getPermissions -> select role (first sync call in Promise.all)
  db.select.mockReturnValueOnce(chainable([{ role: user.role }]));
  // 3. getBlacklistedTags (second sync call in Promise.all)
  db.select.mockReturnValueOnce(chainable(tags));
  // 4. getApiKeyInfo (third sync call in Promise.all)
  db.select.mockReturnValueOnce(chainable(apiKeyResult));
  // 5. getPermissions -> select permissions row (after awaiting role, non-admin only)
  if (!isAdmin) {
    db.select.mockReturnValueOnce(chainable(permRow ? [permRow] : []));
  }
}

describe('UsersService', () => {
  let db: ReturnType<typeof createMockDb>;
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = createMockDb();
    service = new UsersService(db);

    // Reset randomUUID mock
    cryptoModule.randomUUID
      .mockReset()
      .mockReturnValueOnce('generated-user-id')
      .mockReturnValueOnce('generated-account-id');
  });

  describe('findAll', () => {
    it('should return all users without search', async () => {
      // findAll select
      db.select.mockReturnValueOnce(chainable([mockUser]));
      // toUserResponse selects for mockUser
      db.select.mockReturnValueOnce(chainable([{ role: 'user' }]));
      db.select.mockReturnValueOnce(chainable([])); // tags
      db.select.mockReturnValueOnce(chainable([])); // api key
      db.select.mockReturnValueOnce(chainable([])); // permissions

      const result = await service.findAll();

      expect(result.total).toBe(1);
      expect(result.users).toHaveLength(1);
      expect(result.users[0].id).toBe('user-1');
    });

    it('should filter users by search term', async () => {
      db.select.mockReturnValueOnce(chainable([mockUser]));
      db.select.mockReturnValueOnce(chainable([{ role: 'user' }]));
      db.select.mockReturnValueOnce(chainable([]));
      db.select.mockReturnValueOnce(chainable([]));
      db.select.mockReturnValueOnce(chainable([]));

      const result = await service.findAll('test');

      expect(result.total).toBe(1);
      expect(db.select).toHaveBeenCalled();
    });

    it('should return empty list when no users match', async () => {
      db.select.mockReturnValueOnce(chainable([]));

      const result = await service.findAll('nonexistent');

      expect(result.total).toBe(0);
      expect(result.users).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      setupToUserResponse(db, mockUser);

      const result = await service.findById('user-1');

      expect(result.id).toBe('user-1');
      expect(result.name).toBe('Test User');
      expect(result.email).toBe('test@example.com');
    });

    it('should throw NotFoundException when user not found', async () => {
      db.select.mockReturnValueOnce(chainable([]));

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a regular user with default permissions', async () => {
      // Email check
      db.select.mockReturnValueOnce(chainable([]));
      // Insert user, account, permissions
      setupInsert(db);
      // findById return for final result
      setupToUserResponse(db, {
        ...mockUser,
        id: 'generated-user-id',
      });

      const result = await service.create({
        email: 'new@example.com',
        name: 'New User',
        password: 'password123',
      });

      expect(result.id).toBe('generated-user-id');
      expect(db.insert).toHaveBeenCalled();
    });

    it('should create an admin user with all permissions', async () => {
      db.select.mockReturnValueOnce(chainable([]));
      setupInsert(db);
      setupToUserResponse(db, {
        ...mockAdminUser,
        id: 'generated-user-id',
      });

      const result = await service.create({
        email: 'admin@example.com',
        name: 'New Admin',
        password: 'password123',
        isAdmin: true,
      });

      expect(result.permissions.isAdmin).toBe(true);
    });

    it('should throw ConflictException when email already exists', async () => {
      db.select.mockReturnValueOnce(chainable([{ id: 'existing-user' }]));

      await expect(
        service.create({
          email: 'test@example.com',
          name: 'Duplicate',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should not create blacklisted tags for admin users', async () => {
      db.select.mockReturnValueOnce(chainable([]));
      setupInsert(db);
      setupToUserResponse(db, {
        ...mockAdminUser,
        id: 'generated-user-id',
      });

      await service.create({
        email: 'admin@example.com',
        name: 'Admin',
        password: 'password123',
        isAdmin: true,
        blacklistedTags: ['tag-1', 'tag-2'],
      });

      // Insert is called for user, account, and permissions (3 times), but NOT for blacklisted tags
      expect(db.insert).toHaveBeenCalledTimes(3);
    });

    it('should create blacklisted tags for non-admin users', async () => {
      db.select.mockReturnValueOnce(chainable([]));
      setupInsert(db);
      setupToUserResponse(db, {
        ...mockUser,
        id: 'generated-user-id',
      });

      await service.create({
        email: 'user@example.com',
        name: 'User',
        password: 'password123',
        blacklistedTags: ['tag-1', 'tag-2'],
      });

      // Insert for user, account, permissions, and blacklisted tags (4 times)
      expect(db.insert).toHaveBeenCalledTimes(4);
    });
  });

  describe('update', () => {
    it('should update user name', async () => {
      // findById for initial check
      setupToUserResponse(db, mockUser);
      // update call
      setupUpdate(db);
      // findById for return
      setupToUserResponse(db, { ...mockUser, name: 'Updated Name' });

      const result = await service.update(
        'user-1',
        { name: 'Updated Name' },
        'admin-1',
      );

      expect(result.name).toBe('Updated Name');
    });

    it('should prevent self-demotion from admin', async () => {
      setupToUserResponse(db, mockAdminUser);

      await expect(
        service.update('admin-1', { isAdmin: false }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should set all permissions to true when promoting to admin', async () => {
      setupToUserResponse(db, mockUser);
      setupUpdate(db);
      setupInsert(db); // permissions upsert
      setupDelete(db); // clear blacklisted tags
      setupToUserResponse(db, { ...mockUser, role: 'admin' });

      const result = await service.update(
        'user-1',
        { isAdmin: true },
        'admin-1',
      );

      expect(result.permissions.isAdmin).toBe(true);
    });

    it('should update permissions for non-admin user', async () => {
      // First findById call (initial check)
      setupToUserResponse(db, mockUser);
      // permissions upsert
      setupInsert(db);
      // Second findById call (return value) - with updated permissions
      setupToUserResponse(db, mockUser, {
        canEditMetadata: true,
        canUpload: false,
        canDelete: false,
        canGenerateApiKeys: false,
        canRequestContent: false,
      });

      const result = await service.update(
        'user-1',
        { canEditMetadata: true },
        'admin-1',
      );

      expect(result.permissions.canEditMetadata).toBe(true);
    });

    it('should update blacklisted tags for non-admin users', async () => {
      setupToUserResponse(db, mockUser);
      setupDelete(db); // delete old tags
      setupInsert(db); // insert new tags
      setupToUserResponse(db, mockUser);

      await service.update('user-1', { blacklistedTags: ['tag-1'] }, 'admin-1');

      expect(db.delete).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('ban', () => {
    it('should ban a user with reason and expiration', async () => {
      setupUpdate(db);
      const bannedUser = {
        ...mockUser,
        banned: true,
        banReason: 'Violation',
        banExpires: new Date('2025-01-01'),
      };
      setupToUserResponse(db, bannedUser);

      const result = await service.ban(
        'user-1',
        { reason: 'Violation', expiresAt: '2025-01-01T00:00:00.000Z' },
        'admin-1',
      );

      expect(result.banned).toBe(true);
      expect(result.banReason).toBe('Violation');
      expect(db.update).toHaveBeenCalled();
    });

    it('should prevent self-ban', async () => {
      await expect(
        service.ban('admin-1', { reason: 'Test' }, 'admin-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should ban without reason or expiration', async () => {
      setupUpdate(db);
      setupToUserResponse(db, { ...mockUser, banned: true });

      const result = await service.ban('user-1', {}, 'admin-1');

      expect(result.banned).toBe(true);
    });
  });

  describe('unban', () => {
    it('should clear ban status', async () => {
      setupUpdate(db);
      setupToUserResponse(db, {
        ...mockUser,
        banned: false,
        banReason: null,
        banExpires: null,
      });

      const result = await service.unban('user-1');

      expect(result.banned).toBe(false);
      expect(result.banReason).toBeNull();
      expect(result.banExpires).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete user and all related data', async () => {
      setupDelete(db);

      await service.delete('user-1', 'admin-1');

      // Should delete blacklisted tags, permissions, sessions, accounts, and user (5 calls)
      expect(db.delete).toHaveBeenCalledTimes(5);
    });

    it('should prevent self-delete', async () => {
      await expect(service.delete('admin-1', 'admin-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getPermissions', () => {
    it('should return all true for admin user', async () => {
      db.select.mockReturnValueOnce(chainable([{ role: 'admin' }]));

      const result = await service.getPermissions('admin-1');

      expect(result.isAdmin).toBe(true);
      expect(result.canEditMetadata).toBe(true);
      expect(result.canUpload).toBe(true);
      expect(result.canDelete).toBe(true);
      expect(result.canGenerateApiKeys).toBe(true);
      expect(result.canRequestContent).toBe(true);
    });

    it('should return permissions from DB for regular user', async () => {
      db.select.mockReturnValueOnce(chainable([{ role: 'user' }]));
      db.select.mockReturnValueOnce(
        chainable([
          {
            userId: 'user-1',
            canEditMetadata: true,
            canUpload: false,
            canDelete: false,
            canGenerateApiKeys: true,
            canRequestContent: false,
          },
        ]),
      );

      const result = await service.getPermissions('user-1');

      expect(result.isAdmin).toBe(false);
      expect(result.canEditMetadata).toBe(true);
      expect(result.canUpload).toBe(false);
      expect(result.canGenerateApiKeys).toBe(true);
    });

    it('should return all false when no permissions row exists', async () => {
      db.select.mockReturnValueOnce(chainable([{ role: 'user' }]));
      db.select.mockReturnValueOnce(chainable([]));

      const result = await service.getPermissions('user-1');

      expect(result.isAdmin).toBe(false);
      expect(result.canEditMetadata).toBe(false);
      expect(result.canUpload).toBe(false);
      expect(result.canDelete).toBe(false);
      expect(result.canGenerateApiKeys).toBe(false);
      expect(result.canRequestContent).toBe(false);
    });
  });

  describe('getBlacklistedTags', () => {
    it('should return tag IDs', async () => {
      db.select.mockReturnValueOnce(
        chainable([{ tagId: 'tag-1' }, { tagId: 'tag-2' }]),
      );

      const result = await service.getBlacklistedTags('user-1');

      expect(result).toEqual(['tag-1', 'tag-2']);
    });

    it('should return empty array when no tags', async () => {
      db.select.mockReturnValueOnce(chainable([]));

      const result = await service.getBlacklistedTags('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateLanguage', () => {
    it('should update user language', async () => {
      setupUpdate(db);

      await service.updateLanguage('user-1', 'sv');

      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('getLanguage', () => {
    it('should return user language', async () => {
      db.select.mockReturnValueOnce(chainable([{ language: 'sv' }]));

      const result = await service.getLanguage('user-1');

      expect(result).toBe('sv');
    });

    it('should return en as default when no result', async () => {
      db.select.mockReturnValueOnce(chainable([]));

      const result = await service.getLanguage('user-1');

      expect(result).toBe('en');
    });
  });

  describe('updateTheme', () => {
    it('should update primary and surface colors', async () => {
      setupUpdate(db);

      await service.updateTheme('user-1', 'blue', 'dark');

      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('getTheme', () => {
    it('should return user theme', async () => {
      db.select.mockReturnValueOnce(
        chainable([{ primaryColor: 'blue', surfaceColor: 'dark' }]),
      );

      const result = await service.getTheme('user-1');

      expect(result).toEqual({ primaryColor: 'blue', surfaceColor: 'dark' });
    });

    it('should return defaults when no result', async () => {
      db.select.mockReturnValueOnce(chainable([]));

      const result = await service.getTheme('user-1');

      expect(result).toEqual({
        primaryColor: 'orange',
        surfaceColor: 'espresso',
      });
    });
  });

  describe('getApiKeyInfo', () => {
    it('should return null when no active API key', async () => {
      db.select.mockReturnValueOnce(chainable([]));

      const result = await service.getApiKeyInfo('user-1');

      expect(result).toBeNull();
    });

    it('should return key info with lastUsed and lastIp', async () => {
      const lastRequest = new Date('2024-06-01');
      db.select.mockReturnValueOnce(
        chainable([
          {
            id: 'key-1',
            lastRequest,
            metadata: JSON.stringify({ lastIp: '192.168.1.1' }),
          },
        ]),
      );

      const result = await service.getApiKeyInfo('user-1');

      expect(result).toEqual({
        hasKey: true,
        lastUsed: lastRequest.toISOString(),
        lastIp: '192.168.1.1',
      });
    });

    it('should handle null metadata gracefully', async () => {
      db.select.mockReturnValueOnce(
        chainable([
          {
            id: 'key-1',
            lastRequest: null,
            metadata: null,
          },
        ]),
      );

      const result = await service.getApiKeyInfo('user-1');

      expect(result).toEqual({
        hasKey: true,
        lastUsed: null,
        lastIp: null,
      });
    });

    it('should handle invalid JSON metadata', async () => {
      db.select.mockReturnValueOnce(
        chainable([
          {
            id: 'key-1',
            lastRequest: null,
            metadata: 'invalid-json',
          },
        ]),
      );

      const result = await service.getApiKeyInfo('user-1');

      expect(result).toEqual({
        hasKey: true,
        lastUsed: null,
        lastIp: null,
      });
    });
  });
});
