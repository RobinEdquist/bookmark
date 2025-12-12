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
}

@Injectable()
export class MetadataWorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(MetadataWorkerPoolService.name);
  private workers: WorkerState[] = [];
  private taskQueue: PendingTask[] = [];
  private pendingTasks: Map<string, PendingTask> = new Map();
  private taskIdCounter = 0;
  private initialized = false;
  private readonly poolSize: number;

  constructor() {
    // Use half the CPU cores for metadata workers, minimum 2, maximum 8
    this.poolSize = Math.min(8, Math.max(2, Math.floor(os.cpus().length / 2)));
    this.logger.log(
      `Metadata worker pool configured with ${this.poolSize} workers`,
    );
  }

  private async initializePool(): Promise<void> {
    if (this.initialized) return;

    // NestJS compiles TypeScript to dist/, so __dirname points to dist/src/...
    // The worker script is also compiled to .js in the same directory
    const workerPath = path.join(__dirname, 'metadata.worker.js');

    this.logger.log(`Initializing worker pool with script: ${workerPath}`);

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = new Worker(workerPath);

        const workerState: WorkerState = {
          worker,
          busy: false,
          currentTaskId: null,
        };

        worker.on('message', (response: WorkerResponse) => {
          this.handleWorkerResponse(workerState, response);
        });

        worker.on('error', (error) => {
          this.logger.error(`Worker ${i} error: ${error.message}`);
          this.handleWorkerError(workerState, error);
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            this.logger.warn(`Worker ${i} exited with code ${code}`);
          }
          // Remove dead worker and potentially create a new one
          const index = this.workers.indexOf(workerState);
          if (index > -1) {
            this.workers.splice(index, 1);
          }
        });

        this.workers.push(workerState);
      } catch (error) {
        this.logger.error(`Failed to create worker ${i}: ${error}`);
      }
    }

    this.initialized = true;
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
    await this.initializePool();

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
  ): Promise<{ data: number[]; mimeType: string } | null> {
    return this.executeTask('extractCover', filePath);
  }

  async onModuleDestroy(): Promise<void> {
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
