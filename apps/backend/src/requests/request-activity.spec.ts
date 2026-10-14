import {
  requestActivity,
  transferProgress,
  transferState,
  type ActivityRequest,
} from './request-activity';

const now = Date.parse('2026-10-14T12:00:00Z');
const request: ActivityRequest = {
  status: 'approved',
  libraryItemId: null,
  libraryItemType: null,
  torrentHash: 'hash',
  torrentMissingSince: null,
  transferState: null,
  transferProgress: null,
  transferObservedAt: new Date(now),
  transferStale: false,
  submissionUncertain: false,
  searchError: null,
};

describe('Request activity observations', () => {
  it.each([null, undefined, NaN, Infinity, -0.01, 1.01, '0.5'])(
    'keeps invalid/unknown progress unknown: %s',
    (progress) => {
      expect(transferProgress(progress)).toBeNull();
    },
  );
  it.each([0, 0.42, 1])('retains a known progress fraction: %s', (progress) =>
    expect(transferProgress(progress)).toBe(progress),
  );
  it.each(['paused', 'stalled', 'queued', 'checking'] as const)(
    'reports %s independently of approval status',
    (state) => {
      expect(
        requestActivity(
          { ...request, transferState: state, transferProgress: 0.42 },
          null,
          now,
        ),
      ).toMatchObject({ stage: 'downloading', issue: state, progress: 0.42 });
    },
  );
  it.each(['completed', 'moving'] as const)(
    'waits for import after a %s transfer',
    (state) => {
      expect(
        requestActivity(
          { ...request, transferState: state, transferProgress: 1 },
          null,
          now,
        ).stage,
      ).toBe('adding_to_library');
    },
  );
  it('does not infer transfer completion from 100 percent', () => {
    expect(
      requestActivity(
        { ...request, transferState: 'downloading', transferProgress: 1 },
        null,
        now,
      ).stage,
    ).toBe('downloading');
  });
  it('does not infer activity from an unknown raw state', () => {
    expect(transferState('seeding-or-some-future-state')).toBe('unknown');
    expect(
      requestActivity({ ...request, transferState: 'unknown' }, null, now),
    ).toMatchObject({ stage: 'needs_attention', issue: 'status_unknown' });
  });
  it('retains the observed percentage/state while retrying a failed lookup', () => {
    expect(
      requestActivity(
        {
          ...request,
          transferState: 'paused',
          transferProgress: 0.42,
          transferStale: true,
        },
        null,
        now,
      ),
    ).toMatchObject({
      transferState: 'paused',
      progress: 0.42,
      stale: true,
      observedAt: new Date(now).toISOString(),
    });
  });
  it('marks aging observations stale even if the worker stopped', () => {
    expect(requestActivity(request, null, now + 90_001).stale).toBe(true);
  });
  it.each(['pending', 'ignored'])(
    'reports a failed import as needing attention: %s',
    (status) => {
      expect(
        requestActivity(
          { ...request, transferState: 'completed' },
          status,
          now,
        ),
      ).toMatchObject({ stage: 'needs_attention', issue: 'import_failed' });
    },
  );
  it('reports retrying imports separately and keeps them out of ready', () => {
    expect(
      requestActivity(
        { ...request, transferState: 'completed' },
        'retrying',
        now,
      ),
    ).toMatchObject({ stage: 'adding_to_library', issue: 'import_retrying' });
  });
  it('requires usable library confirmation rather than status alone', () => {
    expect(
      requestActivity({ ...request, status: 'complete' }, null, now).stage,
    ).toBe('needs_attention');
    expect(
      requestActivity(
        {
          ...request,
          status: 'complete',
          libraryItemId: 'library-id',
          libraryItemType: 'ebook',
          transferStale: true,
        },
        'pending',
        now,
      ),
    ).toMatchObject({ stage: 'ready', stale: false, issue: null });
  });
  it('shows reconciliation for uncertain submission without claiming downloading', () => {
    expect(
      requestActivity(
        { ...request, torrentHash: null, submissionUncertain: true },
        null,
        now,
      ),
    ).toMatchObject({
      stage: 'needs_attention',
      issue: 'submission_uncertain',
    });
  });
  it.each(['pending', 'waiting', 'rejected'] as const)(
    'preserves the %s policy stage despite old transfer data',
    (status) => {
      expect(
        requestActivity(
          {
            ...request,
            status,
            transferState: 'completed',
            transferProgress: 1,
          },
          null,
          now,
        ).stage,
      ).toBe(
        {
          pending: 'waiting_approval',
          waiting: 'waiting_availability',
          rejected: 'rejected',
        }[status],
      );
    },
  );
});
