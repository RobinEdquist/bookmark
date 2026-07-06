import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

function makeContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('AdminGuard', () => {
  it('allows admin session users', () => {
    const guard = new AdminGuard();

    expect(
      guard.canActivate(
        makeContext({ session: { user: { id: 'admin-1', role: 'admin' } } }),
      ),
    ).toBe(true);
  });

  it('allows admin API-token users', () => {
    const guard = new AdminGuard();

    expect(
      guard.canActivate(
        makeContext({ apiTokenUser: { id: 'admin-1', role: 'admin' } }),
      ),
    ).toBe(true);
  });

  it('rejects missing and non-admin users', () => {
    const guard = new AdminGuard();

    expect(() => guard.canActivate(makeContext({}))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            session: { user: { id: 'user-1', role: 'user' } },
          }),
        }),
      } as ExecutionContext),
    ).toThrow('Admin access required');
  });
});
