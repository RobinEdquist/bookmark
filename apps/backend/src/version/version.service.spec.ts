import { ConfigService } from '@nestjs/config';
import { VersionService } from './version.service';

function makeService(env: Record<string, string | undefined>): VersionService {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;
  return new VersionService(config);
}

describe('VersionService', () => {
  it('reports a tagged build as the release channel', () => {
    const info = makeService({
      APP_VERSION: '0.1.0',
      GIT_SHA: 'a1b2c3d',
      BUILD_TIME: '2026-08-04T10:32:00Z',
    }).getVersion();

    expect(info).toEqual({
      version: '0.1.0',
      baseVersion: '0.1.0',
      channel: 'release',
      gitSha: 'a1b2c3d',
      buildTime: '2026-08-04T10:32:00Z',
    });
  });

  it('reports a git-describe build as the dev channel and keeps the base version', () => {
    const info = makeService({ APP_VERSION: '0.1.0-12-ga1b2c3d' }).getVersion();

    expect(info.channel).toBe('dev');
    expect(info.version).toBe('0.1.0-12-ga1b2c3d');
    // The base version is what an update check must compare against — a naive
    // semver compare would rank the dev build BELOW the 0.1.0 it is ahead of.
    expect(info.baseVersion).toBe('0.1.0');
  });

  it('treats a genuine prerelease tag as a release, not a dev build', () => {
    const info = makeService({ APP_VERSION: '0.2.0-beta.1' }).getVersion();

    expect(info.channel).toBe('release');
    expect(info.baseVersion).toBe('0.2.0');
  });

  it('falls back to an unknown version when APP_VERSION is absent', () => {
    const info = makeService({}).getVersion();

    expect(info.version).toBe('0.0.0-dev');
    expect(info.gitSha).toBe('unknown');
    expect(info.buildTime).toBeNull();
  });

  it('treats blank build args as absent', () => {
    const info = makeService({
      APP_VERSION: '   ',
      GIT_SHA: '',
      BUILD_TIME: '  ',
    }).getVersion();

    expect(info.version).toBe('0.0.0-dev');
    expect(info.gitSha).toBe('unknown');
    expect(info.buildTime).toBeNull();
  });

  it('strips build metadata from the base version', () => {
    const info = makeService({ APP_VERSION: '0.0.0-dev+abc1234' }).getVersion();

    expect(info.baseVersion).toBe('0.0.0');
  });
});
