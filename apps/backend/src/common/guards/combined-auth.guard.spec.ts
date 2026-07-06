import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class AuthService {},
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn((headers) => headers),
}));

import { Reflector } from '@nestjs/core';
import { CombinedAuthGuard } from './combined-auth.guard';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function createGuard(
  options: {
    allowAnonymous?: boolean;
    optionalAuth?: boolean;
    session?: unknown;
  } = {},
) {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'PUBLIC') return options.allowAnonymous;
      if (key === 'OPTIONAL') return options.optionalAuth;
      return undefined;
    }),
  } as unknown as Reflector;
  const authService = {
    api: {
      getSession: jest.fn().mockResolvedValue(options.session ?? null),
    },
  };

  return {
    guard: new CombinedAuthGuard(reflector, authService as any),
    authService,
  };
}

describe('CombinedAuthGuard', () => {
  it('skips session lookup when API token auth already populated a user', async () => {
    const { guard, authService } = createGuard();
    const request = {
      apiTokenUser: { id: 'user-1' },
      headers: {},
      method: 'GET',
      url: '/api',
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(authService.api.getSession).not.toHaveBeenCalled();
  });

  it('populates request session from Better Auth', async () => {
    const session = { user: { id: 'user-1' } };
    const { guard, authService } = createGuard({ session });
    const request = {
      headers: { cookie: 'sid=1' },
      method: 'GET',
      url: '/api',
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);

    expect(authService.api.getSession).toHaveBeenCalledWith({
      headers: { cookie: 'sid=1' },
    });
    expect(request).toMatchObject({
      session,
      user: session.user,
    });
  });

  it('allows anonymous routes without a user', async () => {
    const { guard } = createGuard({ allowAnonymous: true });

    await expect(
      guard.canActivate(
        makeContext({ headers: {}, method: 'GET', url: '/public' }),
      ),
    ).resolves.toBe(true);
  });

  it('allows optional-auth routes without a user', async () => {
    const { guard } = createGuard({ optionalAuth: true });

    await expect(
      guard.canActivate(
        makeContext({ headers: {}, method: 'GET', url: '/optional' }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects required-auth routes without a user', async () => {
    const { guard } = createGuard();

    await expect(
      guard.canActivate(
        makeContext({ headers: {}, method: 'GET', url: '/private' }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });
});
