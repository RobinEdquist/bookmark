import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';

interface WorkerTask {
  type: 'extractFullMetadata' | 'getFileInfo' | 'extractCover';
  filePath: string;
  taskId: string;
}

interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

interface PendingTask {
  task: WorkerTask;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

interface WorkerState {
  worker: Worker;
  busy: boolean;
  currentTaskId: string | null;
  terminating: boolean;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * MediaInfo runs in WebAssembly and retains its peak linear-memory allocation.
 * Retiring an idle worker is the reliable way to return that memory to the OS.
 */
export const METADATA_WORKER_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class MetadataWorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(MetadataWorkerPoolService.name);
  private workers: WorkerState[] = [];
  private taskQueue: PendingTask[] = [];
  private pendingTasks: Map<string, PendingTask> = new Map();
  private taskIdCounter = 0;
  private initialized = false;
  private readonly poolSize: number;
  private initializationPromise: Promise<void> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private idleShutdownPromise: Promise<void> | null = null;
  private destroying = false;

  constructor() {
    // Use half the CPU cores for metadata workers, minimum 2, maximum 8
    this.poolSize = Math.min(8, Math.max(2, Math.floor(os.cpus().length / 2)));
    this.logger.log(
      `Metadata worker pool configured with ${this.poolSize} workers`,
    );
  }

  private async initializePool(): Promise<void> {
    if (this.destroying) {
      throw new Error('Metadata worker pool is shutting down');
    }

    if (this.idleShutdownPromise) {
      await this.idleShutdownPromise;
    }

    if (this.initialized) return;

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    const initialization = this.createWorkers();
    this.initializationPromise = initialization;
    try {
      await initialization;
    } finally {
      if (this.initializationPromise === initialization) {
        this.initializationPromise = null;
      }
    }
  }

  private async createWorkers(): Promise<void> {
    // NestJS compiles TypeScript to dist/, so __dirname points to dist/src/...
    // The worker script is also compiled to .js in the same directory
    const workerPath = path.join(__dirname, 'metadata.worker.js');

    this.logger.log(`Initializing worker pool with script: ${workerPath}`);

    const workersToCreate = this.poolSize - this.workers.length;
    for (let i = 0; i < workersToCreate; i++) {
      try {
        const worker = new Worker(workerPath);

        const workerState: WorkerState = {
          worker,
          busy: false,
          currentTaskId: null,
          terminating: false,
        };

        worker.on('message', (response: WorkerResponse) => {
          this.handleWorkerResponse(workerState, response);
        });

        worker.on('error', (error: unknown) => {
          const workerError = toError(error);
          this.logger.error(`Worker ${i} error: ${workerError.message}`);
          this.handleWorkerError(workerState, workerError);
        });

        worker.on('exit', (code) => {
          if (code !== 0 && !workerState.terminating) {
            this.logger.warn(`Worker ${i} exited with code ${code}`);
          }
          const index = this.workers.indexOf(workerState);
          if (index > -1) {
            this.workers.splice(index, 1);
          }
          // A worker can exit without a preceding 'error' event (thread OOM,
          // process.exit in a dependency). Recompute like handleWorkerError
          // does, so the next executeTask's initializePool() tops the pool
          // back up instead of early-returning on a permanently smaller one.
          this.initialized = this.workers.length === this.poolSize;
          if (workerState.terminating || this.destroying) return;

          if (workerState.currentTaskId) {
            const pending = this.pendingTasks.get(workerState.currentTaskId);
            if (pending) {
              this.pendingTasks.delete(workerState.currentTaskId);
              pending.reject(
                new Error(`Metadata worker exited with code ${code}`),
              );
            }
            workerState.currentTaskId = null;
          }

          if (this.taskQueue.length > 0) {
            void this.initializePool()
              .then(() => this.processNextTask())
              .catch((workerError: unknown) => {
                this.logger.error(
                  `Failed to replace metadata worker: ${workerError}`,
                );
              });
          }
        });

        this.workers.push(workerState);
      } catch (error) {
        this.logger.error(`Failed to create worker ${i}: ${error}`);
      }
    }

    this.initialized = this.workers.length > 0;
    this.logger.log(
      `Worker pool initialized with ${this.workers.length} workers`,
    );
  }

  private handleWorkerResponse(
    workerState: WorkerState,
    response: WorkerResponse,
  ): void {
    const pending = this.pendingTasks.get(response.taskId);
    if (pending) {
      this.pendingTasks.delete(response.taskId);

      if (response.success) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error || 'Unknown worker error'));
      }
    }

    // Mark worker as available and process next task
    workerState.busy = false;
    workerState.currentTaskId = null;
    this.processNextTask();
    this.scheduleIdleShutdown();
  }

  private handleWorkerError(workerState: WorkerState, error: Error): void {
    if (workerState.currentTaskId) {
      const pending = this.pendingTasks.get(workerState.currentTaskId);
      if (pending) {
        this.pendingTasks.delete(workerState.currentTaskId);
        pending.reject(error);
      }
    }

    workerState.busy = false;
    workerState.currentTaskId = null;

    // An errored Worker normally exits immediately. Remove it before
    // dispatching anything else so a queued task cannot be sent to a broken
    // thread, then restore pool capacity if work is waiting.
    const index = this.workers.indexOf(workerState);
    if (index > -1) this.workers.splice(index, 1);
    this.initialized = this.workers.length === this.poolSize;

    if (this.taskQueue.length > 0 && !this.destroying) {
      void this.initializePool()
        .then(() => this.processNextTask())
        .catch((workerError: unknown) => {
          this.logger.error(
            `Failed to replace metadata worker: ${workerError}`,
          );
        });
    } else {
      this.scheduleIdleShutdown();
    }
  }

  private processNextTask(): void {
    if (this.taskQueue.length === 0) return;

    const availableWorker = this.workers.find((w) => !w.busy);
    if (!availableWorker) return;

    const pendingTask = this.taskQueue.shift();
    if (!pendingTask) return;

    availableWorker.busy = true;
    availableWorker.currentTaskId = pendingTask.task.taskId;
    this.pendingTasks.set(pendingTask.task.taskId, pendingTask);

    availableWorker.worker.postMessage(pendingTask.task);
  }

  private async executeTask<T>(
    type: WorkerTask['type'],
    filePath: string,
  ): Promise<T> {
    this.cancelIdleShutdown();
    await this.initializePool();
    if (this.workers.length === 0) {
      throw new Error('Metadata worker pool could not start any workers');
    }

    const taskId = `task-${++this.taskIdCounter}`;
    const task: WorkerTask = { type, filePath, taskId };

    return new Promise<T>((resolve, reject) => {
      const pendingTask: PendingTask = {
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      // Find an available worker or queue the task
      const availableWorker = this.workers.find((w) => !w.busy);

      if (availableWorker) {
        availableWorker.busy = true;
        availableWorker.currentTaskId = taskId;
        this.pendingTasks.set(taskId, pendingTask);
        availableWorker.worker.postMessage(task);
      } else {
        // Queue the task for later
        this.taskQueue.push(pendingTask);
      }
    });
  }

  private isIdle(): boolean {
    return (
      this.taskQueue.length === 0 &&
      this.pendingTasks.size === 0 &&
      this.workers.every((worker) => !worker.busy)
    );
  }

  private cancelIdleShutdown(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private scheduleIdleShutdown(): void {
    this.cancelIdleShutdown();
    if (this.destroying || this.workers.length === 0 || !this.isIdle()) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.destroying || !this.isIdle()) return;

      const shutdown = this.retireIdleWorkers();
      this.idleShutdownPromise = shutdown;
      void shutdown.finally(() => {
        if (this.idleShutdownPromise === shutdown) {
          this.idleShutdownPromise = null;
        }
      });
    }, METADATA_WORKER_IDLE_TIMEOUT_MS);
    this.idleTimer.unref();
  }

  private async retireIdleWorkers(): Promise<void> {
    if (!this.isIdle() || this.workers.length === 0) return;

    const workers = this.workers.splice(0);
    this.initialized = false;
    this.logger.log(
      `Retiring ${workers.length} metadata workers after ${METADATA_WORKER_IDLE_TIMEOUT_MS / 60_000} minutes idle`,
    );

    await Promise.all(
      workers.map(async (workerState) => {
        workerState.terminating = true;
        try {
          await workerState.worker.terminate();
        } catch (error) {
          this.logger.warn(`Error retiring metadata worker: ${error}`);
        }
      }),
    );
  }

  async extractFullMetadata(filePath: string): Promise<{
    metadata: {
      title?: string;
      subtitle?: string;
      author?: string;
      narrator?: string;
      description?: string;
      publisher?: string;
      publishedDate?: string;
      language?: string;
      genres?: string[];
      series?: string;
      seriesOrder?: string;
      hasEmbeddedCover?: boolean;
      duration?: number;
      format?: string;
      bitrate?: number;
      sampleRate?: number;
    };
    fileInfo: {
      filePath: string;
      fileName: string;
      duration: number;
      format: string;
      bitrate?: number;
      sampleRate?: number;
      sizeBytes: number;
    };
    chapters: Array<{ title: string; startTime: number; endTime?: number }>;
  }> {
    return this.executeTask('extractFullMetadata', filePath);
  }

  async getFileInfo(filePath: string): Promise<{
    filePath: string;
    fileName: string;
    duration: number;
    format: string;
    bitrate?: number;
    sampleRate?: number;
    sizeBytes: number;
  }> {
    return this.executeTask('getFileInfo', filePath);
  }

  async extractCover(
    filePath: string,
  ): Promise<{ data: Uint8Array; mimeType: string } | null> {
    return this.executeTask('extractCover', filePath);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroying = true;
    this.cancelIdleShutdown();
    if (this.idleShutdownPromise) {
      await this.idleShutdownPromise;
    }
    this.logger.log('Shutting down worker pool...');

    // Reject all pending tasks
    for (const [taskId, pending] of this.pendingTasks) {
      pending.reject(new Error('Worker pool shutting down'));
      this.pendingTasks.delete(taskId);
    }

    // Reject all queued tasks
    for (const pending of this.taskQueue) {
      pending.reject(new Error('Worker pool shutting down'));
    }
    this.taskQueue = [];

    // Terminate all workers
    const terminationPromises = this.workers.map(async (workerState) => {
      try {
        workerState.terminating = true;
        await workerState.worker.terminate();
      } catch (error) {
        this.logger.warn(`Error terminating worker: ${error}`);
      }
    });

    await Promise.all(terminationPromises);
    this.workers = [];
    this.initialized = false;
    this.logger.log('Worker pool shut down');
  }

  getPoolStats(): { total: number; busy: number; queued: number } {
    return {
      total: this.workers.length,
      busy: this.workers.filter((w) => w.busy).length,
      queued: this.taskQueue.length,
    };
  }
}
