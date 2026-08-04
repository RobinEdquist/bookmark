import { ApiProperty } from '@nestjs/swagger';

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
}
