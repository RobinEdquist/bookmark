import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { MediaDetectorService } from '../media-detector.service';

describe('MediaDetectorService — comics', () => {
  let detector: MediaDetectorService;
  let libraryPath: string;

  beforeEach(async () => {
    detector = new MediaDetectorService();
    libraryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-lib-'));
  });

  afterEach(async () => {
    await fs.rm(libraryPath, { recursive: true, force: true });
  });

  async function touch(relPath: string): Promise<void> {
    const abs = path.join(libraryPath, relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, 'x');
  }

  it('detects a folder with comic files as a series', async () => {
    await touch('Saga (2012)/Saga #001.cbz');
    await touch('Saga (2012)/Saga #002.cbz');

    const units = await detector.scanLibraryForComics(libraryPath);
    expect(units).toHaveLength(1);
    expect(units[0].folderName).toBe('Saga (2012)');
    expect(units[0].isRootOneShot).toBe(false);
    expect(units[0].books.map((b) => b.fileName)).toEqual([
      'Saga #001.cbz',
      'Saga #002.cbz',
    ]);
  });

  it('detects nested publisher folders (series = direct parent)', async () => {
    await touch('Image/Saga (2012)/Saga #001.cbz');
    await touch('Image/Monstress (2015)/Monstress #001.cbr');

    const units = await detector.scanLibraryForComics(libraryPath);
    expect(units).toHaveLength(2);
    const names = units.map((u) => u.folderName).sort();
    expect(names).toEqual(['Monstress (2015)', 'Saga (2012)']);
  });

  it('treats root-level loose files as one-shot series', async () => {
    await touch('Watchmen.pdf');

    const units = await detector.scanLibraryForComics(libraryPath);
    expect(units).toHaveLength(1);
    expect(units[0].isRootOneShot).toBe(true);
    expect(units[0].folderName).toBe('Watchmen');
    expect(units[0].books).toHaveLength(1);
  });

  it('accepts zip/rar extensions and ignores non-comic files', async () => {
    await touch('Series A/a.zip');
    await touch('Series A/b.rar');
    await touch('Series A/notes.txt');
    await touch('Series A/cover.jpg');

    const units = await detector.scanLibraryForComics(libraryPath);
    expect(units).toHaveLength(1);
    expect(units[0].books).toHaveLength(2);
  });

  it('ignores dot-directories', async () => {
    await touch('.hidden/Comic #1.cbz');
    const units = await detector.scanLibraryForComics(libraryPath);
    expect(units).toHaveLength(0);
  });

  it('detects series folders nested under folders that also contain comics', async () => {
    await touch('Saga (2012)/Saga #001.cbz');
    await touch('Saga (2012)/Specials/Saga Special #1.cbz');

    const units = await detector.scanLibraryForComics(libraryPath);
    expect(units).toHaveLength(2);
  });

  it('detectComicSeriesForPath finds the series unit for a new file', async () => {
    await touch('Saga (2012)/Saga #001.cbz');
    const filePath = path.join(libraryPath, 'Saga (2012)/Saga #001.cbz');

    const unit = await detector.detectComicSeriesForPath(filePath, libraryPath);
    expect(unit).not.toBeNull();
    expect(unit!.folderName).toBe('Saga (2012)');
    expect(unit!.books).toHaveLength(1);
  });

  it('detectComicSeriesForPath handles root-level files', async () => {
    await touch('Watchmen.cbz');
    const filePath = path.join(libraryPath, 'Watchmen.cbz');

    const unit = await detector.detectComicSeriesForPath(filePath, libraryPath);
    expect(unit).not.toBeNull();
    expect(unit!.isRootOneShot).toBe(true);
  });
});
