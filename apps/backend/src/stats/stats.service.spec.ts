import { StatsService } from './stats.service';

describe('StatsService', () => {
  describe('getStats', () => {
    it('aggregates library, request, and listening statistics', async () => {
      // The service issues seven queries via Promise.all, in this order:
      // audiobooks, ebooks, comics, pendingRequests, requestsToday,
      // finishedRequests, totalListeningTimeSeconds. Each query selects a
      // single { value } column. We return results in that order.
      const queue = [
        [{ value: 1234 }], // audiobooks
        [{ value: 567 }], // ebooks
        [{ value: 890 }], // comics
        [{ value: 4 }], // pendingRequests
        [{ value: 7 }], // requestsToday
        [{ value: 152 }], // finishedRequests
        [{ value: 987654 }], // totalListeningTimeSeconds
      ];

      let call = 0;
      const select = jest.fn(() => {
        const rows = queue[call++];
        // `.from()` returns an object that is both awaitable (for the
        // listening-time query, which has no WHERE) and exposes `.where()`
        // (for the counted queries). Both resolve to the same canned rows.
        const fromResult = {
          where: jest.fn().mockResolvedValue(rows),
          then: (resolve: (v: unknown) => unknown) => resolve(rows),
        };
        return { from: jest.fn().mockReturnValue(fromResult) };
      });

      const db = { select } as never;
      const service = new StatsService(db);

      const stats = await service.getStats();

      expect(stats).toEqual({
        audiobooks: 1234,
        ebooks: 567,
        comics: 890,
        pendingRequests: 4,
        requestsToday: 7,
        finishedRequests: 152,
        totalListeningTimeSeconds: 987654,
      });
      expect(select).toHaveBeenCalledTimes(7);
    });

    it('defaults missing aggregate values to zero', async () => {
      const select = jest.fn(() => {
        const rows: Array<{ value: number }> = [];
        const fromResult = {
          where: jest.fn().mockResolvedValue(rows),
          then: (resolve: (v: unknown) => unknown) => resolve(rows),
        };
        return { from: jest.fn().mockReturnValue(fromResult) };
      });

      const db = { select } as never;
      const service = new StatsService(db);

      const stats = await service.getStats();

      expect(stats).toEqual({
        audiobooks: 0,
        ebooks: 0,
        comics: 0,
        pendingRequests: 0,
        requestsToday: 0,
        finishedRequests: 0,
        totalListeningTimeSeconds: 0,
      });
    });
  });
});
