import type { requests } from './schema';
import {
  transferProgress,
  type TransferState,
} from '../tracker/transfer-observation';
export {
  transferStates,
  transferProgress,
  transferState,
} from '../tracker/transfer-observation';
export const requestStages = [
  'waiting_approval',
  'waiting_availability',
  'submitting',
  'downloading',
  'adding_to_library',
  'ready',
  'needs_attention',
  'rejected',
] as const;
export const requestIssues = [
  'submission_uncertain',
  'download_error',
  'download_missing',
  'status_unknown',
  'paused',
  'stalled',
  'queued',
  'checking',
  'import_failed',
  'import_retrying',
  'availability_retrying',
] as const;
export interface RequestActivity {
  stage: (typeof requestStages)[number];
  transferState: TransferState | null;
  progress: number | null;
  observedAt: string | null;
  stale: boolean;
  issue: (typeof requestIssues)[number] | null;
}

export type ActivityRequest = Pick<
  typeof requests.$inferSelect,
  | 'status'
  | 'libraryItemId'
  | 'libraryItemType'
  | 'torrentHash'
  | 'torrentMissingSince'
  | 'transferState'
  | 'transferProgress'
  | 'transferObservedAt'
  | 'transferStale'
  | 'submissionUncertain'
  | 'searchError'
>;

export function requestActivity(
  request: ActivityRequest,
  importStatus: string | null = null,
  now = Date.now(),
): RequestActivity {
  const activity: RequestActivity = {
    stage: 'submitting',
    transferState: request.transferState ?? null,
    progress: transferProgress(request.transferProgress),
    observedAt: request.transferObservedAt?.toISOString() ?? null,
    stale:
      request.transferStale ||
      !!(
        request.torrentHash &&
        (!request.transferObservedAt ||
          now - request.transferObservedAt.getTime() > 90_000)
      ),
    issue: null,
  };
  if (
    request.status === 'complete' &&
    request.libraryItemId &&
    request.libraryItemType
  ) {
    return { ...activity, stage: 'ready', stale: false };
  }
  if (request.status === 'rejected')
    return { ...activity, stage: 'rejected', stale: false };
  if (request.status === 'pending')
    return {
      ...activity,
      stage: 'waiting_approval',
      stale: false,
      issue: request.searchError ? 'availability_retrying' : null,
    };
  if (request.status === 'waiting')
    return {
      ...activity,
      stage: 'waiting_availability',
      stale: false,
      issue: request.searchError ? 'availability_retrying' : null,
    };
  if (importStatus === 'pending' || importStatus === 'ignored')
    return { ...activity, stage: 'needs_attention', issue: 'import_failed' };
  if (importStatus === 'retrying')
    return {
      ...activity,
      stage: 'adding_to_library',
      issue: 'import_retrying',
    };
  if (request.submissionUncertain)
    return {
      ...activity,
      stage: 'needs_attention',
      issue: 'submission_uncertain',
    };
  if (
    request.transferState === 'completed' ||
    request.transferState === 'moving'
  )
    return { ...activity, stage: 'adding_to_library' };
  if (request.transferState === 'error')
    return { ...activity, stage: 'needs_attention', issue: 'download_error' };
  if (request.transferState === 'not_found' || request.torrentMissingSince)
    return { ...activity, stage: 'needs_attention', issue: 'download_missing' };
  if (request.transferState === 'downloading')
    return { ...activity, stage: 'downloading' };
  if (
    ['paused', 'stalled', 'queued', 'checking'].includes(
      request.transferState ?? '',
    )
  )
    return {
      ...activity,
      stage: 'downloading',
      issue: request.transferState as RequestActivity['issue'],
    };
  if (request.torrentHash || request.status === 'complete')
    return { ...activity, stage: 'needs_attention', issue: 'status_unknown' };
  return activity;
}
