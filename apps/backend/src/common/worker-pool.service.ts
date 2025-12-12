import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker } from 'worker_threads';
import * as path from 'path';
import * as os from 'os';

interface WorkerTask {
  type: string;
  taskId: string;
  [key: string]: unknown;
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

interface PoolConfig {
  name: string;
  workerScript: string;
  minWorkers?: number;
  maxWorkers?: number;
}

/**
 * Generic worker pool that can manage multiple types of workers.
 * Each pool is identified by name and uses a specific worker script.
 */
@Injectable()
export class WorkerPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(WorkerPoolService.name);
  private pools: Map<
    string,
    {
      workers: WorkerState[];
      taskQueue: PendingTask[];
      pendingTasks: Map<string, PendingTask>;
      taskIdCounter: number;
      config: PoolConfig;
    }
  > = new Map();

  private readonly defaultPoolSize: number;

  constructor() {
    // Use half the CPU cores, minimum 2, maximum 8
    this.defaultPoolSize = Math.min(
      8,
      Math.max(2, Math.floor(os.cpus().length / 2)),
    );
  }

  /**
   * Initialize a worker pool with the given configuration.
   * Call this before using executeTask for a specific pool.
   */
  async initializePool(config: PoolConfig): Promise<void> {
    if (this.pools.has(config.name)) {
      this.logger.debug(`Pool ${config.name} already initialized`);
      return;
    }

    const poolSize = Math.min(
      config.maxWorkers ?? this.defaultPoolSize,
      Math.max(config.minWorkers ?? 2, this.defaultPoolSize),
    );

    const pool = {
      workers: [] as WorkerState[],
      taskQueue: [] as PendingTask[],
      pendingTasks: new Map<string, PendingTask>(),
      taskIdCounter: 0,
      config,
    };

    this.logger.log(
      `Initializing ${config.name} pool with ${poolSize} workers`,
    );

    for (let i = 0; i < poolSize; i++) {
      try {
        const worker = new Worker(config.workerScript);

        const workerState: WorkerState = {
          worker,
          busy: false,
          currentTaskId: null,
        };

        worker.on('message', (response: WorkerResponse) => {
          this.handleWorkerResponse(config.name, workerState, response);
        });

        worker.on('error', (error) => {
          this.logger.error(
            `${config.name} worker ${i} error: ${error.message}`,
          );
          this.handleWorkerError(config.name, workerState, error);
        });

        worker.on('exit', (code) => {
          if (code !== 0) {
            this.logger.warn(
              `${config.name} worker ${i} exited with code ${code}`,
            );
          }
          const poolData = this.pools.get(config.name);
          if (poolData) {
            const index = poolData.workers.indexOf(workerState);
            if (index > -1) {
              poolData.workers.splice(index, 1);
            }
          }
        });

        pool.workers.push(workerState);
      } catch (error) {
        this.logger.error(
          `Failed to create ${config.name} worker ${i}: ${error}`,
        );
      }
    }

    this.pools.set(config.name, pool);
    this.logger.log(
      `${config.name} pool initialized with ${pool.workers.length} workers`,
    );
  }

  private handleWorkerResponse(
    poolName: string,
    workerState: WorkerState,
    response: WorkerResponse,
  ): void {
    const pool = this.pools.get(poolName);
    if (!pool) return;

    const pending = pool.pendingTasks.get(response.taskId);
    if (pending) {
      pool.pendingTasks.delete(response.taskId);

      if (response.success) {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error || 'Unknown worker error'));
      }
    }

    workerState.busy = false;
    workerState.currentTaskId = null;
    this.processNextTask(poolName);
  }

  private handleWorkerError(
    poolName: string,
    workerState: WorkerState,
    error: Error,
  ): void {
    const pool = this.pools.get(poolName);
    if (!pool) return;

    if (workerState.currentTaskId) {
      const pending = pool.pendingTasks.get(workerState.currentTaskId);
      if (pending) {
        pool.pendingTasks.delete(workerState.currentTaskId);
        pending.reject(error);
      }
    }

    workerState.busy = false;
    workerState.currentTaskId = null;
  }

  private processNextTask(poolName: string): void {
    const pool = this.pools.get(poolName);
    if (!pool || pool.taskQueue.length === 0) return;

    const availableWorker = pool.workers.find((w) => !w.busy);
    if (!availableWorker) return;

    const pendingTask = pool.taskQueue.shift();
    if (!pendingTask) return;

    availableWorker.busy = true;
    availableWorker.currentTaskId = pendingTask.task.taskId;
    pool.pendingTasks.set(pendingTask.task.taskId, pendingTask);

    availableWorker.worker.postMessage(pendingTask.task);
  }

  /**
   * Execute a task on the specified pool.
   * The pool must be initialized first with initializePool().
   */
  async executeTask<T>(
    poolName: string,
    taskType: string,
    taskData: Record<string, unknown>,
  ): Promise<T> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(
        `Pool ${poolName} not initialized. Call initializePool first.`,
      );
    }

    const taskId = `${poolName}-${++pool.taskIdCounter}`;
    const task: WorkerTask = { type: taskType, taskId, ...taskData };

    return new Promise<T>((resolve, reject) => {
      const pendingTask: PendingTask = {
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      const availableWorker = pool.workers.find((w) => !w.busy);

      if (availableWorker) {
        availableWorker.busy = true;
        availableWorker.currentTaskId = taskId;
        pool.pendingTasks.set(taskId, pendingTask);
        availableWorker.worker.postMessage(task);
      } else {
        pool.taskQueue.push(pendingTask);
      }
    });
  }

  /**
   * Get statistics for a specific pool.
   */
  getPoolStats(
    poolName: string,
  ): { total: number; busy: number; queued: number } | null {
    const pool = this.pools.get(poolName);
    if (!pool) return null;

    return {
      total: pool.workers.length,
      busy: pool.workers.filter((w) => w.busy).length,
      queued: pool.taskQueue.length,
    };
  }

  /**
   * Get statistics for all pools.
   */
  getAllPoolStats(): Record<
    string,
    { total: number; busy: number; queued: number }
  > {
    const stats: Record<
      string,
      { total: number; busy: number; queued: number }
    > = {};
    for (const [name, pool] of this.pools) {
      stats[name] = {
        total: pool.workers.length,
        busy: pool.workers.filter((w) => w.busy).length,
        queued: pool.taskQueue.length,
      };
    }
    return stats;
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down all worker pools...');

    for (const [name, pool] of this.pools) {
      this.logger.log(`Shutting down ${name} pool...`);

      // Reject all pending tasks
      for (const [taskId, pending] of pool.pendingTasks) {
        pending.reject(new Error('Worker pool shutting down'));
        pool.pendingTasks.delete(taskId);
      }

      // Reject all queued tasks
      for (const pending of pool.taskQueue) {
        pending.reject(new Error('Worker pool shutting down'));
      }
      pool.taskQueue = [];

      // Terminate all workers
      const terminationPromises = pool.workers.map(async (workerState) => {
        try {
          await workerState.worker.terminate();
        } catch (error) {
          this.logger.warn(`Error terminating ${name} worker: ${error}`);
        }
      });

      await Promise.all(terminationPromises);
      pool.workers = [];
    }

    this.pools.clear();
    this.logger.log('All worker pools shut down');
  }
}

/**
 * Helper to get the path to a compiled worker script.
 * Works in both development and production.
 */
export function getWorkerPath(dirname: string, workerName: string): string {
  return path.join(dirname, `${workerName}.js`);
}
