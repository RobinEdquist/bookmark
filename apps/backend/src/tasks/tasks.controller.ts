import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/guards/auth.guard';
import { ImportQueueService } from '../library-watcher/import-queue.service';
import { HardcoverService } from '../hardcover/hardcover.service';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(
    private importQueueService: ImportQueueService,
    private hardcoverService: HardcoverService,
  ) {}

  @Get('status')
  async getTasksStatus() {
    const [pendingHardcoverCount, failedHardcoverItems] = await Promise.all([
      this.hardcoverService.getPendingQueueCount(),
      this.hardcoverService.getFailedQueueItems(),
    ]);

    return {
      import: {
        pendingCount: this.importQueueService.getPendingCount(),
        pendingPaths: this.importQueueService.getPendingPaths(),
      },
      hardcoverSync: {
        pendingCount: pendingHardcoverCount,
        failedCount: failedHardcoverItems.length,
      },
    };
  }
}
