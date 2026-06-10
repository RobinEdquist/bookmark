import { ConflictException, NotFoundException } from '@nestjs/common';
import { createMockDb, createChainMock, type MockDb } from '@test-utils';
import { ApiKeysService, MAX_API_KEYS_PER_USER } from '../api-keys.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = 'user-1';
const KEY_ID = 'key-1';

const mockKeyRow = {
  id: KEY_ID,
  name: 'OPDS Access Key',
  start: 'sk_test_',
  createdAt: new Date('2025-01-01'),
  lastRequest: new Date('2025-06-01'),
  metadata: JSON.stringify({ lastIp: '192.168.1.1' }),
};

function createMockAuth(overrides: Record<string, any> = {}) {
  return {
    api: {
      createApiKey: jest.fn().mockResolvedValue({
        id: 'new-key-id',
        name: 'OPDS Access Key',
        key: 'sk_test_full_key_value',
        start: 'sk_test_',
        createdAt: new Date('2025-01-01'),
      }),
      deleteApiKey: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiKeysService', () => {
  let db: MockDb;
  let service: ApiKeysService;

  beforeEach(() => {
    db = createMockDb();
    service = new ApiKeysService(db as any);
  });

  // -----------------------------------------------------------------------
  // getUserApiKeys
  // -----------------------------------------------------------------------
  describe('getUserApiKeys', () => {
    it('returns empty array when no keys found', async () => {
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.orderBy.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getUserApiKeys(USER_ID);

      expect(result).toEqual([]);
    });

    it('returns all enabled keys with parsed metadata', async () => {
      const secondKeyRow = {
        ...mockKeyRow,
        id: 'key-2',
        name: 'My iPhone',
        metadata: null,
      };
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.orderBy.mockResolvedValue([secondKeyRow, mockKeyRow]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getUserApiKeys(USER_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'key-2',
        name: 'My iPhone',
        start: 'sk_test_',
        createdAt: mockKeyRow.createdAt,
        lastRequest: mockKeyRow.lastRequest,
        lastIp: null,
      });
      expect(result[1]).toEqual({
        id: KEY_ID,
        name: 'OPDS Access Key',
        start: 'sk_test_',
        createdAt: mockKeyRow.createdAt,
        lastRequest: mockKeyRow.lastRequest,
        lastIp: '192.168.1.1',
      });
    });

    it('handles invalid JSON in metadata gracefully', async () => {
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.orderBy.mockResolvedValue([
        { ...mockKeyRow, metadata: 'not-valid-json' },
      ]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getUserApiKeys(USER_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.lastIp).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // createApiKey
  // -----------------------------------------------------------------------
  describe('createApiKey', () => {
    function mockExistingKeyCount(count: number) {
      const selectChain = createChainMock(['from', 'where', 'orderBy']);
      selectChain.where.mockResolvedValue(
        Array.from({ length: count }, (_, i) => ({ id: `key-${i}` })),
      );
      db.select.mockReturnValue(selectChain);
    }

    it('creates a key without revoking existing keys', async () => {
      mockExistingKeyCount(2);
      const authInstance = createMockAuth();

      const result = await service.createApiKey(
        USER_ID,
        authInstance,
        'My iPhone',
      );

      expect(db.delete).not.toHaveBeenCalled();
      expect(authInstance.api.createApiKey).toHaveBeenCalledWith({
        body: { name: 'My iPhone', userId: USER_ID },
      });
      expect(result).toEqual({
        id: 'new-key-id',
        name: 'OPDS Access Key',
        key: 'sk_test_full_key_value',
        start: 'sk_test_',
        createdAt: expect.any(Date),
      });
    });

    it('uses a dated default name when name is missing', async () => {
      mockExistingKeyCount(0);
      const authInstance = createMockAuth();

      await service.createApiKey(USER_ID, authInstance);

      const callBody = authInstance.api.createApiKey.mock.calls[0][0].body;
      expect(callBody.name).toMatch(/^API Key \d{4}-\d{2}-\d{2}$/);
      expect(callBody.userId).toBe(USER_ID);
    });

    it('uses the default name when provided name is blank', async () => {
      mockExistingKeyCount(0);
      const authInstance = createMockAuth();

      await service.createApiKey(USER_ID, authInstance, '   ');

      const callBody = authInstance.api.createApiKey.mock.calls[0][0].body;
      expect(callBody.name).toMatch(/^API Key \d{4}-\d{2}-\d{2}$/);
    });

    it('trims the provided name', async () => {
      mockExistingKeyCount(0);
      const authInstance = createMockAuth();

      await service.createApiKey(USER_ID, authInstance, '  KOReader  ');

      const callBody = authInstance.api.createApiKey.mock.calls[0][0].body;
      expect(callBody.name).toBe('KOReader');
    });

    it('throws ConflictException when the user already has 10 keys', async () => {
      mockExistingKeyCount(MAX_API_KEYS_PER_USER);
      const authInstance = createMockAuth();

      await expect(
        service.createApiKey(USER_ID, authInstance, 'One Too Many'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(authInstance.api.createApiKey).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // revokeApiKey
  // -----------------------------------------------------------------------
  describe('revokeApiKey', () => {
    it('throws NotFoundException when key not found', async () => {
      const deleteChain = createChainMock(['where', 'returning']);
      deleteChain.returning.mockResolvedValue([]);
      db.delete.mockReturnValue(deleteChain);

      await expect(
        service.revokeApiKey('nonexistent', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the row when key exists and belongs to user', async () => {
      const deleteChain = createChainMock(['where', 'returning']);
      deleteChain.returning.mockResolvedValue([{ id: KEY_ID }]);
      db.delete.mockReturnValue(deleteChain);

      const result = await service.revokeApiKey(KEY_ID, USER_ID);

      expect(result).toEqual({ success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // revokeUserApiKeyByUserId
  // -----------------------------------------------------------------------
  describe('revokeUserApiKeyByUserId', () => {
    it('calls delete to revoke all user keys', async () => {
      const deleteChain = createChainMock(['where', 'returning']);
      deleteChain.where.mockResolvedValue(undefined);
      db.delete.mockReturnValue(deleteChain);

      const result = await service.revokeUserApiKeyByUserId(USER_ID);

      expect(result).toEqual({ success: true });
      expect(db.delete).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateKeyUsage
  // -----------------------------------------------------------------------
  describe('updateKeyUsage', () => {
    it('updates metadata with IP address', async () => {
      const updateChain = createChainMock(['set', 'where', 'returning']);
      updateChain.where.mockResolvedValue(undefined);
      db.update.mockReturnValue(updateChain);

      await service.updateKeyUsage(KEY_ID, '10.0.0.1');

      expect(db.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({
        metadata: JSON.stringify({ lastIp: '10.0.0.1' }),
      });
    });
  });
});
