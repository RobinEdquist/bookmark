import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyPermissionGuard } from './api-key-permission.guard';

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        session: { user },
        apiTokenUser: undefined,
      }),
    }),
  } as ExecutionContext;
}

function makeDb(canGenerateApiKeys: boolean | undefined) {
  const limit = jest
    .fn()
    .mockResolvedValue(
      canGenerateApiKeys === undefined ? [] : [{ canGenerateApiKeys }],
    );
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select } as any;
}

describe('ApiKeyPermissionGuard', () => {
  it('passes for admins without checking the database', async () => {
    const db = makeDb(false);
    const guard = new ApiKeyPermissionGuard(db);

    await expect(
      guard.canActivate(makeContext({ id: 'admin-1', role: 'admin' })),
    ).resolves.toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('passes for users with API key permission', async () => {
    const guard = new ApiKeyPermissionGuard(makeDb(true));

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).resolves.toBe(true);
  });

  it('rejects unauthenticated users', async () => {
    const guard = new ApiKeyPermissionGuard(makeDb(true));

    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects users without API key permission', async () => {
    const guard = new ApiKeyPermissionGuard(makeDb(false));

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects users without a permissions row', async () => {
    const guard = new ApiKeyPermissionGuard(makeDb(undefined));

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).rejects.toThrow(ForbiddenException);
  });
});
