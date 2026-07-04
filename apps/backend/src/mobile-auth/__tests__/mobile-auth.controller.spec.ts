import { ConflictException } from '@nestjs/common';

// @thallesp/nestjs-better-auth is ESM-only and won't load under ts-jest's CJS
// transform (which is why no controller in this repo had a spec until now).
// The controller only needs the two no-op decorators and the AuthService type.
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
  OptionalAuth: () => () => undefined,
  AuthService: class AuthService {},
}));

import { MobileAuthController } from '../mobile-auth.controller';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATE = 'test-nonce-1234';

function createMockRes() {
  return {
    setHeader: jest.fn(),
    append: jest.fn(),
    redirect: jest.fn(),
  } as any;
}

function createController(overrides: {
  oidcEnabled?: boolean;
  signInWithOAuth2?: jest.Mock;
  createApiKey?: jest.Mock;
  canGenerateApiKeys?: jest.Mock;
  betterAuthUrl?: string;
}) {
  const signInWithOAuth2 =
    overrides.signInWithOAuth2 ??
    jest.fn().mockResolvedValue({
      headers: {
        getSetCookie: () => ['better-auth.state=signed-state; Path=/'],
      },
      response: { url: 'https://idp.example.com/authorize?client_id=x' },
    });

  const mobileAuthService = {
    canGenerateApiKeys:
      overrides.canGenerateApiKeys ?? jest.fn().mockResolvedValue(true),
  };
  const apiKeysService = {
    createApiKey:
      overrides.createApiKey ??
      jest.fn().mockResolvedValue({
        id: 'key-1',
        name: 'Bookmark iOS - SSO',
        key: 'bkmrk_new_key',
        start: 'bkmrk_new',
        createdAt: new Date('2026-01-01'),
      }),
  };
  const authService = {
    api: { signInWithOAuth2 },
    instance: { api: {} },
  };
  const oidcConfigService = {
    isOidcEnabled: jest.fn().mockReturnValue(overrides.oidcEnabled ?? true),
  };
  const configService = {
    get: jest
      .fn()
      .mockReturnValue(overrides.betterAuthUrl ?? 'https://books.example.com'),
  };

  const controller = new MobileAuthController(
    mobileAuthService as any,
    apiKeysService as any,
    authService as any,
    oidcConfigService as any,
    configService as any,
  );

  return {
    controller,
    signInWithOAuth2,
    createApiKey: apiKeysService.createApiKey,
    canGenerateApiKeys: mobileAuthService.canGenerateApiKeys,
  };
}

function freshSessionRequest(userOverrides: Record<string, any> = {}) {
  return {
    session: {
      user: { id: 'user-1', role: 'user', ...userOverrides },
      session: { createdAt: new Date() },
    },
  } as any;
}

function redirectedURL(res: any): URL {
  expect(res.redirect).toHaveBeenCalledWith(302, expect.any(String));
  return new URL(res.redirect.mock.calls[0][1]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MobileAuthController', () => {
  describe('start', () => {
    it('redirects to the app with sso_disabled when OIDC is off', async () => {
      const { controller, signInWithOAuth2 } = createController({
        oidcEnabled: false,
      });
      const res = createMockRes();

      await controller.start({ state: STATE }, res);

      const url = redirectedURL(res);
      expect(`${url.protocol}//${url.host}`).toBe('bookmark://setup');
      expect(url.searchParams.get('error')).toBe('sso_disabled');
      expect(url.searchParams.get('state')).toBe(STATE);
      expect(signInWithOAuth2).not.toHaveBeenCalled();
    });

    it('starts the OAuth flow, forwards cookies, and redirects to the IdP', async () => {
      const { controller, signInWithOAuth2 } = createController({});
      const res = createMockRes();

      await controller.start({ state: STATE, name: 'My iPhone (SSO)' }, res);

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      const body = signInWithOAuth2.mock.calls[0][0].body;
      expect(body.providerId).toBe('oidc');
      expect(body.disableRedirect).toBe(true);
      const callbackURL = new URLSearchParams(body.callbackURL.split('?')[1]);
      expect(body.callbackURL.startsWith('/api/mobile-auth/complete?')).toBe(
        true,
      );
      expect(callbackURL.get('state')).toBe(STATE);
      expect(callbackURL.get('name')).toBe('My iPhone (SSO)');
      expect(
        body.errorCallbackURL.startsWith('/api/mobile-auth/complete?state='),
      ).toBe(true);

      expect(res.append).toHaveBeenCalledWith(
        'Set-Cookie',
        'better-auth.state=signed-state; Path=/',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        'https://idp.example.com/authorize?client_id=x',
      );
    });

    it('redirects to the app with server_error when Better Auth throws', async () => {
      const { controller } = createController({
        signInWithOAuth2: jest.fn().mockRejectedValue(new Error('boom')),
      });
      const res = createMockRes();

      await controller.start({ state: STATE }, res);

      expect(redirectedURL(res).searchParams.get('error')).toBe('server_error');
    });
  });

  describe('complete', () => {
    it('passes a Better Auth error code through to the app', async () => {
      const { controller, createApiKey } = createController({});
      const res = createMockRes();

      await controller.complete(
        { state: STATE, error: 'signup_disabled' },
        freshSessionRequest(),
        res,
      );

      expect(redirectedURL(res).searchParams.get('error')).toBe(
        'signup_disabled',
      );
      expect(createApiKey).not.toHaveBeenCalled();
    });

    it('redirects with unauthenticated when there is no cookie session', async () => {
      const { controller } = createController({});
      const res = createMockRes();

      await controller.complete(
        { state: STATE },
        { session: null, apiTokenUser: { id: 'user-1' } } as any,
        res,
      );

      expect(redirectedURL(res).searchParams.get('error')).toBe(
        'unauthenticated',
      );
    });

    it('rejects sessions older than the freshness window', async () => {
      const { controller, createApiKey } = createController({});
      const res = createMockRes();
      const staleRequest = {
        session: {
          user: { id: 'user-1', role: 'user' },
          session: { createdAt: new Date(Date.now() - 10 * 60_000) },
        },
      } as any;

      await controller.complete({ state: STATE }, staleRequest, res);

      expect(redirectedURL(res).searchParams.get('error')).toBe(
        'stale_session',
      );
      expect(createApiKey).not.toHaveBeenCalled();
    });

    it('redirects with not_permitted when the user lacks the key permission', async () => {
      const { controller } = createController({
        canGenerateApiKeys: jest.fn().mockResolvedValue(false),
      });
      const res = createMockRes();

      await controller.complete({ state: STATE }, freshSessionRequest(), res);

      expect(redirectedURL(res).searchParams.get('error')).toBe(
        'not_permitted',
      );
    });

    it('maps the key-quota ConflictException to key_limit', async () => {
      const { controller } = createController({
        createApiKey: jest
          .fn()
          .mockRejectedValue(new ConflictException('max keys')),
      });
      const res = createMockRes();

      await controller.complete({ state: STATE }, freshSessionRequest(), res);

      expect(redirectedURL(res).searchParams.get('error')).toBe('key_limit');
    });

    it('mints a key and redirects with key, state, and server', async () => {
      const { controller, createApiKey } = createController({});
      const res = createMockRes();

      await controller.complete(
        { state: STATE, name: 'My iPhone (SSO)' },
        freshSessionRequest(),
        res,
      );

      expect(createApiKey).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
        'My iPhone (SSO)',
      );
      const url = redirectedURL(res);
      expect(url.searchParams.get('key')).toBe('bkmrk_new_key');
      expect(url.searchParams.get('state')).toBe(STATE);
      expect(url.searchParams.get('server')).toBe('https://books.example.com');
      expect(url.searchParams.get('error')).toBeNull();
    });

    it('uses the default key name when none is provided', async () => {
      const { controller, createApiKey } = createController({});
      const res = createMockRes();

      await controller.complete({ state: STATE }, freshSessionRequest(), res);

      expect(createApiKey).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
        'Bookmark iOS - SSO',
      );
    });
  });
});
