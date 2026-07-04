import { createMockDb, createChainMock, type MockDb } from '@test-utils';
import { MobileAuthService } from '../mobile-auth.service';

describe('MobileAuthService', () => {
  let db: MockDb;
  let service: MobileAuthService;

  beforeEach(() => {
    db = createMockDb();
    service = new MobileAuthService(db as any);
  });

  function mockPermissionRows(rows: { canGenerateApiKeys: boolean }[]) {
    const selectChain = createChainMock(['from', 'where', 'limit']);
    selectChain.limit.mockResolvedValue(rows);
    db.select.mockReturnValue(selectChain);
  }

  it('allows admins without touching the database', async () => {
    const result = await service.canGenerateApiKeys({
      id: 'user-1',
      role: 'admin',
    });

    expect(result).toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('allows users with the canGenerateApiKeys permission', async () => {
    mockPermissionRows([{ canGenerateApiKeys: true }]);

    const result = await service.canGenerateApiKeys({
      id: 'user-1',
      role: 'user',
    });

    expect(result).toBe(true);
  });

  it('denies users whose permission row disables key generation', async () => {
    mockPermissionRows([{ canGenerateApiKeys: false }]);

    const result = await service.canGenerateApiKeys({
      id: 'user-1',
      role: 'user',
    });

    expect(result).toBe(false);
  });

  it('denies users without a permission row', async () => {
    mockPermissionRows([]);

    const result = await service.canGenerateApiKeys({
      id: 'user-1',
      role: 'user',
    });

    expect(result).toBe(false);
  });
});
