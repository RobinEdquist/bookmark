import {
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OpdsAuthGuard } from './opds-auth.guard';

function makeContext(request: Record<string, unknown>, response = {}) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

describe('OpdsAuthGuard', () => {
  it('returns 404 when OPDS is disabled', async () => {
    const guard = new OpdsAuthGuard({
      isOpdsEnabled: jest.fn().mockResolvedValue(false),
    } as any);

    await expect(
      guard.canActivate(
        makeContext({
          path: '/opds',
          method: 'GET',
          headers: {},
        }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('sets WWW-Authenticate and rejects unauthenticated requests', async () => {
    const response = { setHeader: jest.fn() };
    const guard = new OpdsAuthGuard({
      isOpdsEnabled: jest.fn().mockResolvedValue(true),
    } as any);

    await expect(
      guard.canActivate(
        makeContext(
          {
            path: '/opds',
            method: 'GET',
            headers: { authorization: 'Basic abc' },
          },
          response,
        ),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Basic realm="OPDS"',
    );
  });

  it('allows authenticated session users', async () => {
    const guard = new OpdsAuthGuard({
      isOpdsEnabled: jest.fn().mockResolvedValue(true),
    } as any);

    await expect(
      guard.canActivate(
        makeContext({
          path: '/opds',
          method: 'GET',
          headers: {},
          session: { user: { id: 'user-1' } },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('allows authenticated API token users', async () => {
    const guard = new OpdsAuthGuard({
      isOpdsEnabled: jest.fn().mockResolvedValue(true),
    } as any);

    await expect(
      guard.canActivate(
        makeContext({
          path: '/opds',
          method: 'GET',
          headers: {},
          apiTokenUser: { id: 'user-1' },
        }),
      ),
    ).resolves.toBe(true);
  });
});
