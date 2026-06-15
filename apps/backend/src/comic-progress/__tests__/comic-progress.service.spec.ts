import { Test } from '@nestjs/testing';
import { ComicProgressService } from '../comic-progress.service';
import { DATABASE_CONNECTION } from '../../database/database-connection.constants';

function makeDb(returnRow: Record<string, unknown>) {
  const captured: {
    values?: Record<string, unknown>;
    set?: Record<string, unknown>;
  } = {};
  const db = {
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        captured.values = values;
        return {
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            captured.set = set;
            return { returning: () => Promise.resolve([returnRow]) };
          },
        };
      },
    }),
  };
  return { db, captured };
}

describe('ComicProgressService.recordPageView', () => {
  it('marks finished when reaching the last page', async () => {
    const { db, captured } = makeDb({
      comicBookId: 'b1',
      currentPage: 9,
      pageCount: 10,
      status: 'finished',
      isHidden: false,
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComicProgressService,
        { provide: DATABASE_CONNECTION, useValue: db },
      ],
    }).compile();
    const service = moduleRef.get(ComicProgressService);

    await service.recordPageView('u1', 'b1', 9, 10);

    expect(captured.values).toMatchObject({
      userId: 'u1',
      comicBookId: 'b1',
      currentPage: 9,
      pageCount: 10,
      status: 'finished',
    });
  });

  it('marks in_progress when before the last page', async () => {
    const { db, captured } = makeDb({
      comicBookId: 'b1',
      currentPage: 3,
      pageCount: 10,
      status: 'in_progress',
      isHidden: false,
      startedAt: new Date(),
      updatedAt: new Date(),
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ComicProgressService,
        { provide: DATABASE_CONNECTION, useValue: db },
      ],
    }).compile();
    const service = moduleRef.get(ComicProgressService);

    await service.recordPageView('u1', 'b1', 3, 10);

    expect(captured.values).toMatchObject({
      status: 'in_progress',
      currentPage: 3,
    });
  });
});
