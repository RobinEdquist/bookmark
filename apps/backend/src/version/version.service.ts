import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VersionResponseDto } from './dto/version-response.dto';

/**
 * Trailing form that `git describe --tags` appends when HEAD is not exactly on
 * a tag: `-<commits since tag>-g<short sha>`. Matching this specifically (rather
 * than "has a prerelease part") keeps a genuine prerelease tag like
 * `v0.2.0-beta.1` classified as a release instead of a dev build.
 */
const GIT_DESCRIBE_DEV_SUFFIX = /-\d+-g[0-9a-f]+$/;

const UNKNOWN_VERSION = '0.0.0-dev';

/**
 * The build-provenance half of {@link VersionResponseDto}. Derived from `Omit`
 * so the two cannot drift: the controller pairs this with the update-check
 * result to form the response.
 */
export type BuildInfo = Omit<VersionResponseDto, 'update'>;

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private readonly info: BuildInfo;

  constructor(private readonly config: ConfigService) {
    // Baked in at image build time (Dockerfile ARG -> ENV). A container has no
    // git checkout and cannot read its own OCI labels, so these env vars are
    // the only way the running app can know what it is.
    const version =
      this.config.get<string>('APP_VERSION')?.trim() || UNKNOWN_VERSION;
    const gitSha = this.config.get<string>('GIT_SHA')?.trim() || 'unknown';
    const buildTime = this.config.get<string>('BUILD_TIME')?.trim() || '';

    const channel = GIT_DESCRIBE_DEV_SUFFIX.test(version) ? 'dev' : 'release';

    this.info = {
      version,
      // Strip the prerelease/build metadata to get the release this derives
      // from. `0.1.0-12-ga1b2c3d` -> `0.1.0`.
      baseVersion: version.split('-')[0]!.split('+')[0]!,
      channel,
      gitSha,
      buildTime: buildTime || null,
    };

    if (version === UNKNOWN_VERSION) {
      this.logger.warn(
        'APP_VERSION is not set — reporting an unknown version. This is ' +
          'expected in local development and a build misconfiguration anywhere else.',
      );
    } else {
      this.logger.log(
        `Running version ${version} (${channel}, commit ${gitSha})`,
      );
    }
  }

  getVersion(): BuildInfo {
    return this.info;
  }
}
