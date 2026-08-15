import { Worker } from 'worker_threads';
import {
  METADATA_WORKER_IDLE_TIMEOUT_MS,
  MetadataWorkerPoolService,
} from './metadata-worker-pool.service';

jest.mock('worker_threads', () => ({
  Worker: jest.fn(),
}));

interface MockWorker {
  on: jest.Mock;
  postMessage: jest.Mock;
  terminate: jest.Mock;
  emit: (event: string, value: unknown) => void;
}

function createMockWorker(): MockWorker {
  const listeners = new Map<string, Array<(value: unknown) => void>>();
  const worker: MockWorker = {
    on: jest.fn((event: string, listener: (value: unknown) => void) => {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.push(listener);
      listeners.set(event, eventListeners);
      return worker;
    }),
    postMessage: jest.fn(),
    terminate: jest.fn().mockResolvedValue(0),
    emit: (event, value) => {
      for (const listener of listeners.get(event) ?? []) listener(value);
    },
  };
  return worker;
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('MetadataWorkerPoolService', () => {
  const MockedWorker = jest.mocked(Worker);
  let workers: MockWorker[];
  let service: MetadataWorkerPoolService;

  beforeEach(() => {
    jest.useFakeTimers();
    workers = [];
    MockedWorker.mockImplementation(() => {
      const worker = createMockWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    service = new MetadataWorkerPoolService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('retires idle MediaInfo workers and recreates them for later work', async () => {
    const firstTask = service.getFileInfo('/library/book.m4b');
    await flushMicrotasks();

    const initialWorkerCount = workers.length;
    expect(initialWorkerCount).toBeGreaterThan(0);
    const postedTask = workers[0]!.postMessage.mock.calls[0]![0];
    workers[0]!.emit('message', {
      taskId: postedTask.taskId,
      success: true,
      result: {
        filePath: '/library/book.m4b',
        fileName: 'book.m4b',
        duration: 1,
        format: 'MPEG-4',
        sizeBytes: 10,
      },
    });
    await firstTask;

    jest.advanceTimersByTime(METADATA_WORKER_IDLE_TIMEOUT_MS);
    await flushMicrotasks();

    expect(
      workers
        .slice(0, initialWorkerCount)
        .every((worker) => worker.terminate.mock.calls.length === 1),
    ).toBe(true);
    expect(service.getPoolStats().total).toBe(0);

    const secondTask = service.getFileInfo('/library/another.m4b');
    await flushMicrotasks();
    expect(workers.length).toBe(initialWorkerCount * 2);

    const nextWorker = workers
      .slice(initialWorkerCount)
      .find((worker) => worker.postMessage.mock.calls.length > 0)!;
    expect(nextWorker).toBeDefined();
    const nextPostedTask = nextWorker.postMessage.mock.calls[0]![0];
    nextWorker.emit('message', {
      taskId: nextPostedTask.taskId,
      success: true,
      result: {
        filePath: '/library/another.m4b',
        fileName: 'another.m4b',
        duration: 1,
        format: 'MPEG-4',
        sizeBytes: 10,
      },
    });
    await secondTask;
  });
});
