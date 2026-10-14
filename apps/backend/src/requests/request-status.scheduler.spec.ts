import { Test } from '@nestjs/testing';
import { ScheduleModule } from '@nestjs/schedule';
import { RequestStatusScheduler } from './request-status.scheduler';
import { RequestsService } from './requests.service';

describe('Availability queue polling', () => {
  it('polls after a one-minute cooldown without waiting for another whole minute', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-09T12:00:00Z'));
    let readyAt = Date.now();
    const batchStarts: number[] = [];
    const service = {
      searchWaitingRequests: jest.fn(async () => {
        if (Date.now() < readyAt) return;
        batchStarts.push(Date.now());
        // A quick batch finishes just after the cron tick, followed by the
        // persisted one-minute cooldown enforced by RequestsService.
        readyAt = Date.now() + 500 + 60_000;
      }),
      recoverStaleSubmissions: jest.fn(async () => undefined),
      updateDownloadingStatuses: jest.fn(async () => undefined),
    };
    const module = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        RequestStatusScheduler,
        { provide: RequestsService, useValue: service },
      ],
    }).compile();
    try {
      await module.init();
      await jest.advanceTimersByTimeAsync(80_000);
      expect(
        batchStarts.map((time) => time - Date.parse('2026-10-09T12:00:00Z')),
      ).toEqual([10_000, 80_000]);
    } finally {
      await module.close();
      jest.useRealTimers();
    }
  });
});
