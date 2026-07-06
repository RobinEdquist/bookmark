import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SignupGuard } from './signup.guard';

function makeContext(path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path }),
    }),
  } as ExecutionContext;
}

function makeDb(users: Array<{ id: string }>) {
  const limit = jest.fn().mockResolvedValue(users);
  const from = jest.fn().mockReturnValue({ limit });
  const select = jest.fn().mockReturnValue({ from });
  return { select } as any;
}

describe('SignupGuard', () => {
  it('allows non-signup routes without checking settings', async () => {
    const settings = { isSignupEnabled: jest.fn() };
    const db = makeDb([{ id: 'user-1' }]);
    const guard = new SignupGuard(settings as any, db);

    await expect(
      guard.canActivate(makeContext('/api/auth/login')),
    ).resolves.toBe(true);
    expect(db.select).not.toHaveBeenCalled();
    expect(settings.isSignupEnabled).not.toHaveBeenCalled();
  });

  it('allows first-user signup even when signups are disabled', async () => {
    const settings = { isSignupEnabled: jest.fn().mockResolvedValue(false) };
    const guard = new SignupGuard(settings as any, makeDb([]));

    await expect(
      guard.canActivate(makeContext('/api/auth/sign-up')),
    ).resolves.toBe(true);
    expect(settings.isSignupEnabled).not.toHaveBeenCalled();
  });

  it('allows signup when users exist and signup is enabled', async () => {
    const settings = { isSignupEnabled: jest.fn().mockResolvedValue(true) };
    const guard = new SignupGuard(settings as any, makeDb([{ id: 'user-1' }]));

    await expect(
      guard.canActivate(makeContext('/api/auth/sign-up')),
    ).resolves.toBe(true);
  });

  it('rejects signup when users exist and signup is disabled', async () => {
    const settings = { isSignupEnabled: jest.fn().mockResolvedValue(false) };
    const guard = new SignupGuard(settings as any, makeDb([{ id: 'user-1' }]));

    await expect(
      guard.canActivate(makeContext('/api/auth/sign-up')),
    ).rejects.toThrow(ForbiddenException);
  });
});
