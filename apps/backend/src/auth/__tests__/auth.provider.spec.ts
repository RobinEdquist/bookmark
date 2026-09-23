import { ConfigService } from '@nestjs/config';
import { buildOidcProviderConfig, createAuthInstance } from '../auth.provider';

/**
 * The drizzle adapter receives a NodePgDatabase handle, but constructing the
 * better-auth instance never connects: queries only run inside hooks and
 * route handlers, which these tests never trigger.
 */
function createConfigService(
  values: Record<string, string> = {},
): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (!(key in values)) {
        throw new Error(`Config key missing: ${key}`);
      }
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('createAuthInstance', () => {
  const requiredConfig = {
    UI_URL: 'http://localhost:3001',
  };

  it('tightens the credential endpoints with custom rate limit rules', () => {
    const auth = createAuthInstance(
      {} as never,
      createConfigService(requiredConfig),
    );

    const rules = (
      auth.options.rateLimit as {
        customRules: Record<string, { window: number; max: number }>;
      }
    ).customRules;

    // 5 sign-ins / 3 sign-ups per minute per IP — the brute-force budget.
    expect(rules['/sign-in/email']).toEqual({ window: 60, max: 5 });
    expect(rules['/sign-up/email']).toEqual({ window: 60, max: 3 });
  });

  it('does not change the core limiter defaults (production-only, in-memory)', () => {
    const auth = createAuthInstance(
      {} as never,
      createConfigService(requiredConfig),
    );

    const rateLimit = auth.options.rateLimit as Record<string, unknown>;

    // `enabled` stays untouched so better-auth's own default governs:
    // enabled in production, disabled in development/test (the e2e suites
    // rely on that to create several users per run).
    expect(rateLimit).not.toHaveProperty('enabled');
    expect(rateLimit).not.toHaveProperty('storage');
  });

  it('accepts the drizzle schema, including the nullable leftover issuer column', async () => {
    const auth = createAuthInstance(
      {} as never,
      createConfigService(requiredConfig),
    );
    const ctx = await auth.$context;

    // Schema validation runs before the query. A mismatch throws here;
    // the fake database then fails the query itself.
    try {
      await ctx.internalAdapter.findUserByEmail('nobody@example.com');
      throw new Error('expected the fake database query to fail');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toMatch(/schema/i);
      expect(message).not.toMatch(/issuer/i);
    }
  });
});

describe('buildOidcProviderConfig', () => {
  const oidcConfig = {
    enabled: true,
    issuerUrl: 'https://idp.example.com/application/o/bookmark',
    clientId: 'bookmark',
    clientSecret: 'secret',
  };

  it('does not pin accountIssuer; identity is the provider id plus subject', () => {
    const config = buildOidcProviderConfig(oidcConfig);

    // 1.7.5 removed the pin. Discovery issuer validates the id_token only.
    expect(config).not.toHaveProperty('accountIssuer');
    expect(config.providerId).toBe('oidc');
    expect(config.discoveryUrl).toBe(
      'https://idp.example.com/application/o/bookmark/.well-known/openid-configuration',
    );
    expect(config.scopes).toEqual(['openid', 'profile', 'email']);
  });
});
