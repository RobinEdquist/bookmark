import { isNewerVersion, parseVersion } from './semver.util';

describe('parseVersion', () => {
  it('parses a plain triple', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('tolerates a v prefix and surrounding whitespace', () => {
    expect(parseVersion('  v0.1.0 ')).toEqual({ major: 0, minor: 1, patch: 0 });
  });

  it('pads missing components', () => {
    expect(parseVersion('v2')).toEqual({ major: 2, minor: 0, patch: 0 });
    expect(parseVersion('v2.5')).toEqual({ major: 2, minor: 5, patch: 0 });
  });

  it('ignores trailing suffixes', () => {
    expect(parseVersion('0.1.0-12-ga1b2c3d')).toEqual({
      major: 0,
      minor: 1,
      patch: 0,
    });
  });

  it('returns null for junk and empty input', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
    expect(parseVersion('nightly')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it.each([
    ['0.2.0', '0.1.0', true],
    ['1.0.0', '0.9.9', true],
    ['0.1.1', '0.1.0', true],
    ['0.10.0', '0.9.0', true], // not a string comparison
    ['0.1.0', '0.1.0', false], // equal is not newer
    ['0.1.0', '0.2.0', false],
    ['0.0.9', '0.1.0', false],
  ])('%s vs %s -> %s', (candidate, current, expected) => {
    expect(isNewerVersion(candidate, current)).toBe(expected);
  });

  it('reports no update for a dev build sitting on the newest release', () => {
    // Base version of `0.1.0-12-ga1b2c3d` is 0.1.0 — the build is 12 commits
    // AHEAD of the 0.1.0 release, so 0.1.0 must not be offered as an update.
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
  });

  it('fails closed on unparseable input rather than nagging', () => {
    expect(isNewerVersion('garbage', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.2.0', 'garbage')).toBe(false);
    expect(isNewerVersion(null, '0.1.0')).toBe(false);
  });
});
