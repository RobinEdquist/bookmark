import { Worker } from 'worker_threads';
import { WorkerPoolService } from '../worker-pool.service';

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

describe('WorkerPoolService', () => {
  const MockedWorker = jest.mocked(Worker);
  let workers: MockWorker[];
  let service: WorkerPoolService;

  beforeEach(() => {
    workers = [];
    MockedWorker.mockImplementation(() => {
      const worker = createMockWorker();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    service = new WorkerPoolService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  it('registers a pool without creating workers', async () => {
    await service.initializePool({
      name: 'test',
      workerScript: '/test-worker.js',
      minWorkers: 1,
      maxWorkers: 2,
    });

    expect(MockedWorker).not.toHaveBeenCalled();
    expect(service.getPoolStats('test')).toEqual({
      total: 0,
      busy: 0,
      queued: 0,
    });
  });

  it('starts lazily and transfers dedicated task buffers', async () => {
    await service.initializePool({
      name: 'test',
      workerScript: '/test-worker.js',
      minWorkers: 1,
      maxWorkers: 2,
    });
    const data = Uint8Array.from([1, 2, 3]);
    const resultPromise = service.executeTask<string>(
      'test',
      'work',
      { data },
      [data.buffer],
    );

    expect(MockedWorker).toHaveBeenCalledTimes(2);
    const [task, transferList] = workers[0]!.postMessage.mock.calls[0]!;
    expect(task).toEqual(expect.objectContaining({ type: 'work', data }));
    expect(transferList).toEqual([data.buffer]);

    workers[0]!.emit('message', {
      taskId: task.taskId,
      success: true,
      result: 'done',
    });
    await expect(resultPromise).resolves.toBe('done');
  });
});
