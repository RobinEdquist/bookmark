import {
  resolveContainedPath,
  isSafeRelativePath,
} from '../path-containment.util';

describe('resolveContainedPath', () => {
  it('resolves a plain relative path inside the root', () => {
    expect(resolveContainedPath('/data/library', 'Author/Title/file.m4b')).toBe(
      '/data/library/Author/Title/file.m4b',
    );
  });

  it('resolves paths with redundant segments without escaping', () => {
    expect(
      resolveContainedPath('/data/library', 'Author/./Title/../Title/file.m4b'),
    ).toBe('/data/library/Author/Title/file.m4b');
  });

  it.each([
    ['../outside', '../outside'],
    ['a/../../outside', 'a/../../outside'],
    ['a/b/../../../etc/passwd', '/etc/passwd'],
  ])('throws when %j would escape the root', (relative) => {
    expect(() => resolveContainedPath('/data/library', relative)).toThrow(
      /outside the library root/,
    );
  });

  it('throws for absolute input paths', () => {
    expect(() => resolveContainedPath('/data/library', '/etc/passwd')).toThrow(
      /absolute path/,
    );
  });

  it('throws when the result is the root itself', () => {
    expect(() => resolveContainedPath('/data/library', '')).toThrow(
      /library root itself/,
    );
    expect(() => resolveContainedPath('/data/library', '.')).toThrow(
      /library root itself/,
    );
  });

  it('normalizes the root before resolving', () => {
    expect(resolveContainedPath('/data/library/', 'sub/../sub/file.m4b')).toBe(
      '/data/library/sub/file.m4b',
    );
  });
});

describe('isSafeRelativePath', () => {
  it.each([
    'file.m4b',
    'Author/Title/file.m4b',
    'Author/./Title/../Title/file.m4b',
    'single',
  ])('accepts %j', (value) => {
    expect(isSafeRelativePath(value)).toBe(true);
  });

  it.each([
    '',
    '..',
    '../outside',
    'a/../..',
    'a/../../outside',
    '/absolute/path',
    '/file.m4b',
  ])('rejects %j', (value) => {
    expect(isSafeRelativePath(value)).toBe(false);
  });
});
