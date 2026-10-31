// ws-events.service pulls in an ESM-only auth package Jest cannot require.
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: class {},
}));

import * as os from 'os';
import { TtsGenerationProcessor } from '../tts-generation.processor';

/** Every select resolves to no rows, whatever the chain. */
function emptySelect(): object {
  const builder: object = new Proxy(
    {},
    {
      get: (_target, prop) =>
        prop === 'then'
          ? (resolve: (value: unknown) => void) => resolve([])
          : () => builder,
    },
  );
  return builder;
}

const ebook = {
  id: 'ebook-1',
  title: 'Martin - ASOIAF 2 - A Clash of Kings',
  subtitle: null,
  isExplicit: false,
  publishedDate: null,
  description: null,
  language: 'en',
} as never;

function build(
  resolved:
    | { title: string; subtitle: string | null; authorNames: string[] }
    | undefined,
) {
  const set = jest.fn(() => ({ where: jest.fn(async () => undefined) }));
  const db = {
    select: jest.fn(() => emptySelect()),
    update: jest.fn(() => ({ set })),
  };
  const assembler = { assemble: jest.fn(async () => '/work/book.m4b') };
  const metadataResolver = { forMedia: jest.fn(async () => resolved) };
  const stub = {} as never;

  const processor = new TtsGenerationProcessor(
    db as never,
    { getEbookLibraryPath: jest.fn(async () => null) } as never,
    { getEbookCoverPath: () => '/nonexistent/cover.jpg' } as never,
    stub, // wsEvents
    stub, // ttsService
    assembler as never,
    stub, // ebookMetadata
    stub, // mediaDetector
    stub, // mediaImporter
    stub, // importQueue
    stub, // libraryScanner
    metadataResolver as never,
  );
  // Private steps under test
  const steps = processor as unknown as {
    assembleM4b(
      job: object,
      ebook: object,
      extraction: object,
      wavFileNames: string[],
      workDir: string,
    ): Promise<string>;
    linkToEbook(audiobookId: string, ebook: object): Promise<void>;
  };
  return { steps, assembler, set, metadataResolver };
}

describe('TtsGenerationProcessor', () => {
  it('tags the m4b with the title and authors the ebook page shows', async () => {
    const { steps, assembler, metadataResolver } = build({
      title: 'A Clash of Kings',
      subtitle: 'A Song of Ice and Fire, Book 2',
      authorNames: ['George R.R. Martin'],
    });

    await steps.assembleM4b(
      { voice: 'af_heart' },
      ebook,
      { chapters: [] },
      [],
      os.tmpdir(),
    );

    expect(metadataResolver.forMedia).toHaveBeenCalledWith('ebook', 'ebook-1');
    expect(assembler.assemble).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.objectContaining({
          title: 'A Clash of Kings',
          album: 'A Clash of Kings',
          artist: 'George R.R. Martin',
        }),
      }),
    );
  });

  it('stores the resolved subtitle on the generated audiobook', async () => {
    const { steps, set } = build({
      title: 'A Clash of Kings',
      subtitle: 'A Song of Ice and Fire, Book 2',
      authorNames: [],
    });

    await steps.linkToEbook('audiobook-1', ebook);

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        generatedFromEbookId: 'ebook-1',
        subtitle: 'A Song of Ice and Fire, Book 2',
      }),
    );
  });
});
