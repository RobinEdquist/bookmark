import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VersionService } from './version.service';
import { UpdateInfoDto } from './dto/version-response.dto';
import { isNewerVersion } from './semver.util';

const GITHUB_API_BASE = 'https://api.github.com';
const DEFAULT_REPO = 'RobinEdquist/bookmark';
const REQUEST_TIMEOUT_MS = 10_000;

/** Shape of the fields we read from GitHub's releases API. */
interface GitHubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * Polls the project's GitHub releases so an instance can tell its admin it is
 * behind.
 *
 * Runs server-side on purpose: one request per instance instead of one per open
 * browser tab, no CORS, no per-user brush with GitHub's unauthenticated rate
 * limit, and only the server's IP is exposed to GitHub rather than every
 * user's. Nothing about the instance is sent — it is a plain GET of a public
 * endpoint — but it is still an outbound call from someone else's machine, so
 * UPDATE_CHECK_ENABLED=false turns it off entirely.
 */
@Injectable()
export class UpdateCheckService implements OnModuleInit {
  private readonly logger = new Logger(UpdateCheckService.name);
  private readonly enabled: boolean;
  private readonly repo: string;
  private latest: UpdateInfoDto | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly versionService: VersionService,
  ) {
    this.enabled =
      (this.config.get<string>('UPDATE_CHECK_ENABLED') ?? 'true')
        .trim()
        .toLowerCase() !== 'false';
    this.repo =
      this.config.get<string>('UPDATE_CHECK_REPO')?.trim() || DEFAULT_REPO;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log(
        'Update checks are disabled (UPDATE_CHECK_ENABLED=false)',
      );
      return;
    }
    // Kick off one check shortly after boot so a freshly started instance does
    // not sit blank until the first cron tick. Detached: a failure here must
    // never hold up or crash startup.
    setTimeout(() => {
      void this.refresh();
    }, 10_000).unref();
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async scheduledRefresh(): Promise<void> {
    if (!this.enabled) return;
    await this.refresh();
  }

  /** Last known result, or null if disabled / not yet checked / unavailable. */
  getUpdateInfo(): UpdateInfoDto | null {
    return this.latest;
  }

  private async refresh(): Promise<void> {
    const release = await this.fetchLatestRelease();
    if (!release) return;

    const latestVersion = release.tag_name?.replace(/^v/, '') ?? null;
    if (!latestVersion) {
      this.logger.warn('Latest GitHub release has no tag name; skipping');
      return;
    }

    // Compared against baseVersion, never `version`: a dev build reading
    // `0.1.0-12-ga1b2c3d` is 12 commits AHEAD of 0.1.0, but sorts below it as
    // semver. Using the base version means "is there a release newer than the
    // one I was cut from", which is the right question on both channels.
    const { baseVersion } = this.versionService.getVersion();
    const available = isNewerVersion(latestVersion, baseVersion);

    this.latest = {
      available,
      latestVersion,
      releaseName: release.name?.trim() || null,
      releaseUrl: release.html_url ?? null,
      publishedAt: release.published_at ?? null,
      checkedAt: new Date().toISOString(),
    };

    if (available) {
      this.logger.log(
        `Update available: ${latestVersion} (running ${baseVersion})`,
      );
    } else {
      this.logger.debug(
        `Up to date: latest release ${latestVersion}, running ${baseVersion}`,
      );
    }
  }

  private async fetchLatestRelease(): Promise<GitHubRelease | null> {
    const url = `${GITHUB_API_BASE}/repos/${this.repo}/releases/latest`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          // GitHub rejects unauthenticated requests without a User-Agent.
          'User-Agent': 'Bookmark-update-check',
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 404) {
        // No releases published yet, or the repo was renamed. Not an error.
        this.logger.debug(`No published release found for ${this.repo}`);
        return null;
      }

      if (response.status === 403 || response.status === 429) {
        this.logger.debug(
          `GitHub rate limit hit while checking for updates (${response.status}); will retry on the next tick`,
        );
        return null;
      }

      if (!response.ok) {
        this.logger.warn(
          `Update check failed: GitHub returned ${response.status}`,
        );
        return null;
      }

      return (await response.json()) as GitHubRelease;
    } catch (error) {
      // Offline, DNS-blocked, or timed out. Expected on air-gapped instances,
      // so this stays a debug line rather than a recurring warning.
      this.logger.debug(
        `Update check could not reach GitHub: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }
}
