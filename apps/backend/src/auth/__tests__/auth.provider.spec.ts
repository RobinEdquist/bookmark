import { ConfigService } from '@nestjs/config';
import { createAuthInstance } from '../auth.provider';

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
});
