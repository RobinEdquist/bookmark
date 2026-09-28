import { supportsBasicAuth } from '../../../test/helpers/openapi-auth';

jest.mock('../../../test/helpers/credential-lock', () => ({
  withCredentialAccess: (fn: () => Promise<unknown>) => fn(),
}));

type AuthHelper = typeof import('../../../test/helpers/auth.helper');

function loadHelper(): AuthHelper {
  // Separate module state models how different Jest files load the helper.
  jest.resetModules();
  return jest.requireActual<AuthHelper>('../../../test/helpers/auth.helper');
}

function sessionResponse() {
  return new Response(
    JSON.stringify({ user: { id: 'admin-id', name: 'Shared Admin' } }),
    {
      status: 200,
      headers: {
        'Set-Cookie': 'better-auth.session_token=test-session; Path=/',
      },
    },
  );
}

describe('shared E2E admin bootstrap', () => {
  const originalBaseUrl = process.env.TEST_BASE_URL;
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => sessionResponse());
  });
  afterEach(() => {
    fetchMock.mockRestore();
    if (originalBaseUrl === undefined) delete process.env.TEST_BASE_URL;
    else process.env.TEST_BASE_URL = originalBaseUrl;
  });

  it('creates the account once before independent workers only sign in', async () => {
    const setup = loadHelper();
    const workers = Array.from({ length: 8 }, () => loadHelper());
    process.env.TEST_BASE_URL = 'http://localhost:43122';
    await setup.initializeSharedAdmin();
    const users = await Promise.all(
      workers.map((worker) => worker.getSharedAdmin()),
    );
    expect(users.every((user) => user.id === 'admin-id')).toBe(true);
    const paths = fetchMock.mock.calls.map(
      ([url]) => new URL(String(url)).pathname,
    );
    expect(
      paths.filter((path) => path === '/api/auth/sign-up/email'),
    ).toHaveLength(1);
    expect(
      paths.filter((path) => path === '/api/auth/sign-in/email'),
    ).toHaveLength(8);
    // The URL is read at call time, after global setup has selected its port.
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).startsWith('http://localhost:43122/'),
      ),
    ).toBe(true);
  });

  it('shares a pending sign-in between concurrent callers in one worker', async () => {
    const helper = loadHelper();
    await Promise.all(Array.from({ length: 8 }, () => helper.getSharedAdmin()));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/sign-in/email');
  });

  it('surfaces bootstrap failures without falling back to sign-in', async () => {
    const helper = loadHelper();
    fetchMock.mockResolvedValueOnce(
      new Response('Database unavailable', { status: 500 }),
    );
    await expect(helper.initializeSharedAdmin()).rejects.toThrow(
      'Sign-up failed',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never falls back to sign-up after a failed sign-in and permits a later retry', async () => {
    const helper = loadHelper();
    fetchMock.mockResolvedValueOnce(
      new Response('Invalid credentials', { status: 401 }),
    );
    await expect(helper.getSharedAdmin()).rejects.toThrow('Sign-in failed');
    await expect(helper.getSharedAdmin()).resolves.toMatchObject({
      id: 'admin-id',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fetchMock.mock.calls.every(([url]) =>
        String(url).includes('/sign-in/email'),
      ),
    ).toBe(true);
  });
});

describe('E2E OpenAPI auth classification', () => {
  it('keeps OPDS routes in the Basic registry when other authentication alternatives are documented', () => {
    expect(supportsBasicAuth({ security: [{ basic: [] }] })).toBe(true);
    expect(
      supportsBasicAuth({
        security: [
          { basic: [] },
          { 'api-key': [] },
          { 'better-auth.session_token': [] },
        ],
      }),
    ).toBe(true);
    expect(
      supportsBasicAuth({
        security: [{ 'api-key': [] }, { 'better-auth.session_token': [] }],
      }),
    ).toBe(false);
    expect(supportsBasicAuth({})).toBe(false);
    expect(supportsBasicAuth({ security: [] })).toBe(false);
  });
});
