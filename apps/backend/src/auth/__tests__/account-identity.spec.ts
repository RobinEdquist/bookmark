import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';

/**
 * better-auth 1.7.3+ looks accounts up with findAccountByKey(providerId,
 * accountId). These tests seed the 1.7.2 row shape — including an issuer
 * string that does not match the configured OIDC issuer — and prove the
 * 1.7.5 lookup still returns that row.
 */
describe('better-auth 1.7.5 account identity', () => {
  const configuredIssuer = 'https://idp.example.com/application/o/bookmark';
  const discoveredIssuer = 'https://idp.example.com/application/o/bookmark/';

  async function createAuth(accounts: Array<Record<string, unknown>>) {
    const db = {
      user: [
        {
          id: 'user-1',
          name: 'Reader',
          email: 'reader@example.com',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'user-2',
          name: 'Other',
          email: 'other@example.com',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      session: [],
      account: accounts,
      verification: [],
    };
    const auth = betterAuth({
      secret: 'test-secret-test-secret-test-secret',
      baseURL: 'http://localhost:3000',
      emailAndPassword: { enabled: true },
      database: memoryAdapter(db),
    });
    const ctx = await auth.$context;
    return { auth, ctx, db };
  }

  function oidcAccount(
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      id: 'oidc-account',
      providerId: 'oidc',
      accountId: 'subject-123',
      userId: 'user-1',
      // 1.7.2 stored the discovered issuer, which can differ from
      // OIDC_ISSUER_URL by a trailing slash. 1.7.5 must ignore it.
      issuer: discoveredIssuer,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  it('resolves an existing OIDC account when the stored issuer differs from the configured issuer', async () => {
    const account = oidcAccount();
    const { ctx, db } = await createAuth([account]);

    const found = await ctx.internalAdapter.findAccountByKey({
      providerId: 'oidc',
      accountId: 'subject-123',
    });

    expect(found).toMatchObject({
      id: 'oidc-account',
      userId: 'user-1',
      providerId: 'oidc',
      accountId: 'subject-123',
    });
    // issuer is not an account field in 1.7.5, so the adapter does not
    // return it and the lookup cannot depend on it. The stored value,
    // which disagrees with the configured issuer, is left untouched.
    expect(found).not.toHaveProperty('issuer');
    expect(db.account[0]?.issuer).toBe(discoveredIssuer);
    expect(db.account[0]?.issuer).not.toBe(configuredIssuer);
  });

  it('does not treat a different subject as the same account when the issuer matches', async () => {
    const { ctx } = await createAuth([
      oidcAccount({ issuer: configuredIssuer }),
    ]);

    const found = await ctx.internalAdapter.findAccountByKey({
      providerId: 'oidc',
      accountId: 'subject-other',
    });

    expect(found).toBeNull();
  });

  it('resolves credential accounts whether issuer is the 1.7.2 sentinel or unset', async () => {
    const { ctx, db } = await createAuth([
      {
        id: 'credential-legacy',
        providerId: 'credential',
        accountId: 'user-1',
        userId: 'user-1',
        issuer: 'local:credential',
        password: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'credential-new',
        providerId: 'credential',
        accountId: 'user-2',
        userId: 'user-2',
        issuer: null,
        password: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const legacy = await ctx.internalAdapter.findCredentialAccount('user-1');
    const createdOn175 =
      await ctx.internalAdapter.findCredentialAccount('user-2');

    expect(legacy).toMatchObject({ id: 'credential-legacy' });
    expect(createdOn175).toMatchObject({ id: 'credential-new' });
    expect(legacy).not.toHaveProperty('issuer');
    expect(createdOn175).not.toHaveProperty('issuer');
    expect(db.account.map((row) => row.issuer)).toEqual([
      'local:credential',
      null,
    ]);
  });

  it('leaves issuer unset when linking a new account', async () => {
    const { ctx, db } = await createAuth([]);

    const created = await ctx.internalAdapter.createAccount({
      providerId: 'oidc',
      accountId: 'subject-new',
      userId: 'user-1',
    });

    expect(created).not.toHaveProperty('issuer');
    expect(db.account).toHaveLength(1);
    expect(db.account[0]).not.toHaveProperty('issuer');
  });

  it('rejects two rows that share a provider id and account id', async () => {
    const { ctx } = await createAuth([
      oidcAccount({ id: 'oidc-a', issuer: configuredIssuer }),
      oidcAccount({
        id: 'oidc-b',
        userId: 'user-2',
        issuer: discoveredIssuer,
      }),
    ]);

    await expect(
      ctx.internalAdapter.findAccountByKey({
        providerId: 'oidc',
        accountId: 'subject-123',
      }),
    ).rejects.toThrow(/Multiple accounts match/);
  });
});
