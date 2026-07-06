import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CanGenerateAudiobooksGuard } from './can-generate-audiobooks.guard';

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

function makeDb(canGenerateAudiobooks: boolean | undefined) {
  const limit = jest
    .fn()
    .mockResolvedValue(
      canGenerateAudiobooks === undefined ? [] : [{ canGenerateAudiobooks }],
    );
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const select = jest.fn().mockReturnValue({ from });
  return { select } as any;
}

describe('CanGenerateAudiobooksGuard', () => {
  it('passes for admins without checking the database', async () => {
    const db = makeDb(false);
    const guard = new CanGenerateAudiobooksGuard(db);

    await expect(
      guard.canActivate(makeContext({ id: 'admin-1', role: 'admin' })),
    ).resolves.toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('passes for users with audiobook generation permission', async () => {
    const guard = new CanGenerateAudiobooksGuard(makeDb(true));

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).resolves.toBe(true);
  });

  it('rejects unauthenticated users', async () => {
    const guard = new CanGenerateAudiobooksGuard(makeDb(true));

    await expect(guard.canActivate(makeContext(undefined))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rejects users without audiobook generation permission', async () => {
    const guard = new CanGenerateAudiobooksGuard(makeDb(false));

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects users without a permissions row', async () => {
    const guard = new CanGenerateAudiobooksGuard(makeDb(undefined));

    await expect(
      guard.canActivate(makeContext({ id: 'user-1', role: 'user' })),
    ).rejects.toThrow(ForbiddenException);
  });
});
