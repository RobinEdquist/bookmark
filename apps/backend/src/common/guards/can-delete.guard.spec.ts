import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CanDeleteGuard } from './can-delete.guard';

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        session: { user },
        apiTokenUser: undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function makeDb(canDelete: boolean | undefined) {
  const limit = jest
    .fn()
    .mockResolvedValue(canDelete === undefined ? [] : [{ canDelete }]);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select } as any;
}

describe('CanDeleteGuard', () => {
  it('passes for admin users without checking the database', async () => {
    const db = makeDb(false);
    const guard = new CanDeleteGuard(db);
    const context = makeContext({ id: 'u1', role: 'admin' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('passes for non-admin users with canDelete=true', async () => {
    const db = makeDb(true);
    const guard = new CanDeleteGuard(db);
    const context = makeContext({ id: 'u2', role: 'user' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('throws ForbiddenException for non-admin users with canDelete=false', async () => {
    const db = makeDb(false);
    const guard = new CanDeleteGuard(db);
    const context = makeContext({ id: 'u3', role: 'user' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when no permissions row exists', async () => {
    const db = makeDb(undefined);
    const guard = new CanDeleteGuard(db);
    const context = makeContext({ id: 'u4', role: 'user' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when user is not authenticated', async () => {
    const db = makeDb(true);
    const guard = new CanDeleteGuard(db);
    const context = makeContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
