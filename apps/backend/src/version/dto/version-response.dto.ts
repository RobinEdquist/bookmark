import { ApiProperty } from '@nestjs/swagger';

export class UpdateInfoDto {
  @ApiProperty({
    example: false,
    description:
      'True when the latest published release is newer than the release this ' +
      'build was cut from.',
  })
  available!: boolean;

  @ApiProperty({
    example: '0.2.0',
    description: 'Version of the latest published release, without the `v`.',
  })
  latestVersion!: string;

  @ApiProperty({
    example: 'Chapters and bookmarks',
    nullable: true,
    description: 'Title of the latest release, if it has one.',
  })
  releaseName!: string | null;

  @ApiProperty({
    example: 'https://github.com/RobinEdquist/bookmark/releases/tag/v0.2.0',
    nullable: true,
    description: 'Link to the release notes.',
  })
  releaseUrl!: string | null;

  @ApiProperty({
    example: '2026-09-01T09:00:00Z',
    nullable: true,
    description: 'When the latest release was published (ISO 8601).',
  })
  publishedAt!: string | null;

  @ApiProperty({
    example: '2026-09-02T06:00:00Z',
    description: 'When this instance last successfully checked (ISO 8601).',
  })
  checkedAt!: string;
}

export class VersionResponseDto {
  @ApiProperty({
    example: '0.1.0',
    description:
      'Full version of the running build. Release builds carry a plain semver ' +
      'version; builds from main carry the `git describe` form ' +
      '(e.g. `0.1.0-12-ga1b2c3d` = 12 commits past v0.1.0).',
  })
  version!: string;

  @ApiProperty({
    example: '0.1.0',
    description:
      'The release this build derives from, with any dev suffix stripped. ' +
      'Equal to `version` on release builds.',
  })
  baseVersion!: string;

  @ApiProperty({
    example: 'release',
    enum: ['release', 'dev'],
    description:
      'Whether this image was built from a version tag (`release`) or from a ' +
      'commit on main (`dev`).',
  })
  channel!: 'release' | 'dev';

  @ApiProperty({
    example: 'a1b2c3d',
    description: 'Short git SHA the image was built from.',
  })
  gitSha!: string;

  @ApiProperty({
    example: '2026-08-04T10:32:00Z',
    nullable: true,
    description: 'When the image was built (ISO 8601), or null if unknown.',
  })
  buildTime!: string | null;

  @ApiProperty({
    type: UpdateInfoDto,
    nullable: true,
    description:
      'Result of the last release check, or null when update checks are ' +
      'disabled, have not run yet, or could not reach GitHub.',
  })
  update!: UpdateInfoDto | null;
}
