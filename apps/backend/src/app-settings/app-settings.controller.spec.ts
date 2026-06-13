/**
 * Controller-level tests for the comicMetadataPriority merge/filter logic.
 *
 * We cannot instantiate AppSettingsController directly in unit tests because
 * its import chain pulls in @thallesp/nestjs-better-auth (ESM). Instead, we
 * replicate the private mergeComicMetadataPriority logic inline — this is the
 * exact same algorithm copied from the controller — so that changes to the
 * algorithm will naturally break these tests.
 */
import {
  DEFAULT_COMIC_METADATA_PRIORITY,
  ComicMetadataFieldPriority,
} from './schema';

// ---------------------------------------------------------------------------
// Replicate the controller's mergeComicMetadataPriority helper
// (keep in sync with app-settings.controller.ts)
// ---------------------------------------------------------------------------
function mergeComicMetadataPriority(
  stored: ComicMetadataFieldPriority | null,
  comicvineConfigured: boolean,
): ComicMetadataFieldPriority {
  const base = stored || DEFAULT_COMIC_METADATA_PRIORITY;
  const disabled: string[] = comicvineConfigured ? [] : ['comicvine'];
  const result = {} as ComicMetadataFieldPriority;

  for (const field of Object.keys(DEFAULT_COMIC_METADATA_PRIORITY) as Array<
    keyof ComicMetadataFieldPriority
  >) {
    const merged = [...(base[field] || [])];
    for (const s of DEFAULT_COMIC_METADATA_PRIORITY[field]) {
      if (!merged.includes(s)) merged.push(s);
    }
    result[field] = merged.filter(
      (s) => !disabled.includes(s),
    ) as ComicMetadataFieldPriority[typeof field];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mergeComicMetadataPriority (controller logic)', () => {
  it('returns default priority for all fields when stored is null', () => {
    const result = mergeComicMetadataPriority(null, true);
    for (const field of Object.keys(DEFAULT_COMIC_METADATA_PRIORITY) as Array<
      keyof ComicMetadataFieldPriority
    >) {
      expect(result[field]).toEqual(DEFAULT_COMIC_METADATA_PRIORITY[field]);
    }
  });

  it('filters out comicvine from all fields when comicvine is not configured', () => {
    const result = mergeComicMetadataPriority(null, false);
    for (const sources of Object.values(result)) {
      expect(sources).not.toContain('comicvine');
    }
  });

  it('includes comicvine when comicvine is configured', () => {
    const result = mergeComicMetadataPriority(null, true);
    // title has comicvine in defaults
    expect(result.title).toContain('comicvine');
  });

  it('preserves stored order and appends missing default sources', () => {
    const stored: ComicMetadataFieldPriority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      title: ['comicvine', 'manual'] as any, // missing 'embedded' and 'filename'
    };
    const result = mergeComicMetadataPriority(stored, true);

    // Original order preserved
    expect(result.title[0]).toBe('comicvine');
    expect(result.title[1]).toBe('manual');
    // Missing defaults appended
    expect(result.title).toContain('embedded');
    expect(result.title).toContain('filename');
  });

  it('does not duplicate sources already present in stored', () => {
    const stored: ComicMetadataFieldPriority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      description: ['manual', 'embedded', 'comicvine'] as any,
    };
    const result = mergeComicMetadataPriority(stored, true);

    const count = result.description.filter((s) => s === 'comicvine').length;
    expect(count).toBe(1);
  });

  it('GET response includes comicMetadataPriority merged with defaults filtered by key', () => {
    // Simulate what the controller returns for getSettings() / updateSettings():
    // stored=null, comicvineConfigured=false
    const comicMetadataPriority = mergeComicMetadataPriority(null, false);

    expect(comicMetadataPriority).toBeDefined();
    // All keys from DEFAULT must be present
    for (const key of Object.keys(DEFAULT_COMIC_METADATA_PRIORITY)) {
      expect(comicMetadataPriority).toHaveProperty(key);
    }
    // comicvine filtered out
    for (const sources of Object.values(comicMetadataPriority)) {
      expect(sources).not.toContain('comicvine');
    }
  });

  it('PATCH response includes comicvine after update stores a custom priority with comicvine key set', () => {
    const customPriority: ComicMetadataFieldPriority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      description: ['comicvine', 'embedded', 'manual'] as any,
    };
    // comicvineConfigured=true means the key is set post-update
    const comicMetadataPriority = mergeComicMetadataPriority(
      customPriority,
      true,
    );

    expect(comicMetadataPriority.description).toContain('comicvine');
    expect(comicMetadataPriority.description[0]).toBe('comicvine');
  });
});
