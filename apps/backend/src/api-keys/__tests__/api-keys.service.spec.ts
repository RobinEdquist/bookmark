import { NotFoundException } from '@nestjs/common';
import { createMockDb, createChainMock, type MockDb } from '@test-utils';
import { ApiKeysService } from '../api-keys.service';

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
  // getUserApiKey
  // -----------------------------------------------------------------------
  describe('getUserApiKey', () => {
    it('returns null when no keys found', async () => {
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getUserApiKey(USER_ID);

      expect(result).toBeNull();
    });

    it('returns key with parsed metadata', async () => {
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.limit.mockResolvedValue([mockKeyRow]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getUserApiKey(USER_ID);

      expect(result).toEqual({
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
      selectChain.limit.mockResolvedValue([
        { ...mockKeyRow, metadata: 'not-valid-json' },
      ]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getUserApiKey(USER_ID);

      expect(result).not.toBeNull();
      expect(result!.lastIp).toBeNull();
    });

    it('returns null lastIp when metadata is null', async () => {
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.limit.mockResolvedValue([{ ...mockKeyRow, metadata: null }]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getUserApiKey(USER_ID);

      expect(result).not.toBeNull();
      expect(result!.lastIp).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // createApiKey
  // -----------------------------------------------------------------------
  describe('createApiKey', () => {
    it('revokes existing keys first then creates new key', async () => {
      // Mock the delete chain for revokeAllUserKeys
      const deleteChain = createChainMock(['where', 'returning']);
      deleteChain.where.mockResolvedValue(undefined);
      db.delete.mockReturnValue(deleteChain);

      const authInstance = createMockAuth();

      const result = await service.createApiKey(USER_ID, authInstance);

      // Should have called delete to revoke existing keys
      expect(db.delete).toHaveBeenCalled();

      // Should have created new key via auth instance
      expect(authInstance.api.createApiKey).toHaveBeenCalledWith({
        body: { name: 'OPDS Access Key', userId: USER_ID },
      });

      expect(result).toEqual({
        id: 'new-key-id',
        name: 'OPDS Access Key',
        key: 'sk_test_full_key_value',
        start: 'sk_test_',
        createdAt: expect.any(Date),
      });
    });
  });

  // -----------------------------------------------------------------------
  // revokeApiKey
  // -----------------------------------------------------------------------
  describe('revokeApiKey', () => {
    it('throws NotFoundException when key not found', async () => {
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      const authInstance = createMockAuth();
      const headers = { authorization: 'Bearer token' };

      await expect(
        service.revokeApiKey('nonexistent', USER_ID, authInstance, headers),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(authInstance.api.deleteApiKey).not.toHaveBeenCalled();
    });

    it('succeeds when key exists and belongs to user', async () => {
      const selectChain = createChainMock([
        'from',
        'where',
        'limit',
        'orderBy',
      ]);
      selectChain.limit.mockResolvedValue([{ id: KEY_ID }]);
      db.select.mockReturnValue(selectChain);

      const authInstance = createMockAuth();
      const headers = { authorization: 'Bearer token' };

      const result = await service.revokeApiKey(
        KEY_ID,
        USER_ID,
        authInstance,
        headers,
      );

      expect(result).toEqual({ success: true });
      expect(authInstance.api.deleteApiKey).toHaveBeenCalledWith({
        body: { keyId: KEY_ID },
        headers,
      });
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
