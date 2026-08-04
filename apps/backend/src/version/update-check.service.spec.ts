import { ConfigService } from '@nestjs/config';
import { UpdateCheckService } from './update-check.service';
import { VersionService, type BuildInfo } from './version.service';

function makeVersionService(
  overrides: Partial<BuildInfo> = {},
): VersionService {
  const info: BuildInfo = {
    version: '0.1.0',
    baseVersion: '0.1.0',
    channel: 'release',
    gitSha: 'a1b2c3d',
    buildTime: null,
    ...overrides,
  };
  return { getVersion: () => info } as unknown as VersionService;
}

function makeService(
  env: Record<string, string | undefined> = {},
  version = makeVersionService(),
): UpdateCheckService {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new UpdateCheckService(config, version);
}

function mockGitHub(
  body: unknown,
  init: { status?: number } = {},
): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue({
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as Response);
}

const RELEASE_0_2_0 = {
  tag_name: 'v0.2.0',
  name: 'Chapter navigation',
  html_url: 'https://github.com/RobinEdquist/bookmark/releases/tag/v0.2.0',
  published_at: '2026-09-01T09:00:00Z',
};

describe('UpdateCheckService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reports an available update when the latest release is newer', async () => {
    mockGitHub(RELEASE_0_2_0);
    const service = makeService();

    await service.scheduledRefresh();

    const info = service.getUpdateInfo();
    expect(info).toMatchObject({
      available: true,
      latestVersion: '0.2.0',
      releaseName: 'Chapter navigation',
      releaseUrl: RELEASE_0_2_0.html_url,
      publishedAt: RELEASE_0_2_0.published_at,
    });
    expect(new Date(info!.checkedAt).toISOString()).toBe(info!.checkedAt);
  });

  it('reports no update when running the latest release', async () => {
    mockGitHub({ ...RELEASE_0_2_0, tag_name: 'v0.1.0' });
    const service = makeService();

    await service.scheduledRefresh();

    expect(service.getUpdateInfo()).toMatchObject({
      available: false,
      latestVersion: '0.1.0',
    });
  });

  it('does not nag a dev build that is ahead of the latest release', async () => {
    mockGitHub({ ...RELEASE_0_2_0, tag_name: 'v0.1.0' });
    const service = makeService(
      {},
      makeVersionService({
        version: '0.1.0-12-ga1b2c3d',
        baseVersion: '0.1.0',
        channel: 'dev',
      }),
    );

    await service.scheduledRefresh();

    expect(service.getUpdateInfo()?.available).toBe(false);
  });

  it('still offers a genuinely newer release to a dev build', async () => {
    mockGitHub(RELEASE_0_2_0);
    const service = makeService(
      {},
      makeVersionService({
        version: '0.1.0-12-ga1b2c3d',
        baseVersion: '0.1.0',
        channel: 'dev',
      }),
    );

    await service.scheduledRefresh();

    expect(service.getUpdateInfo()?.available).toBe(true);
  });

  it('makes no request at all when disabled', async () => {
    const fetchSpy = mockGitHub(RELEASE_0_2_0);
    const service = makeService({ UPDATE_CHECK_ENABLED: 'false' });

    await service.scheduledRefresh();
    service.onModuleInit();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(service.getUpdateInfo()).toBeNull();
  });

  it('treats a rate-limited response as simply unknown', async () => {
    mockGitHub({}, { status: 403 });
    const service = makeService();

    await service.scheduledRefresh();

    expect(service.getUpdateInfo()).toBeNull();
  });

  it('treats a repo with no releases as unknown rather than an error', async () => {
    mockGitHub({}, { status: 404 });
    const service = makeService();

    await service.scheduledRefresh();

    expect(service.getUpdateInfo()).toBeNull();
  });

  it('survives being offline', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ENOTFOUND'));
    const service = makeService();

    await expect(service.scheduledRefresh()).resolves.toBeUndefined();
    expect(service.getUpdateInfo()).toBeNull();
  });

  it('ignores a release with no tag name', async () => {
    mockGitHub({ name: 'untagged' });
    const service = makeService();

    await service.scheduledRefresh();

    expect(service.getUpdateInfo()).toBeNull();
  });

  it('honours a repo override', async () => {
    const fetchSpy = mockGitHub(RELEASE_0_2_0);
    const service = makeService({ UPDATE_CHECK_REPO: 'someone/fork' });

    await service.scheduledRefresh();

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.github.com/repos/someone/fork/releases/latest',
      expect.anything(),
    );
  });
});
