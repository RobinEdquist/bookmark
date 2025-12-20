import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard';
import { ImportQueueService } from '../library-watcher/import-queue.service';
import { HardcoverService } from '../hardcover/hardcover.service';
import { LibraryScannerService } from '../library-watcher/library-scanner.service';

@ApiTags('Tasks')
@ApiSecurity('better-auth.session_token')
@ApiSecurity('api-key')
@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(
    private importQueueService: ImportQueueService,
    private hardcoverService: HardcoverService,
    private libraryScannerService: LibraryScannerService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Get tasks status',
    description:
      'Returns the current status of background tasks including import queues, Hardcover sync, and library scans',
  })
  @ApiResponse({ status: 200, description: 'Status of all background tasks' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTasksStatus() {
    const [pendingHardcoverCount, failedHardcoverItems] = await Promise.all([
      this.hardcoverService.getPendingQueueCount(),
      this.hardcoverService.getFailedQueueItems(),
    ]);

    const scanProgress = this.libraryScannerService.getProgress();
    const isScanning = this.libraryScannerService.isScanning();

    return {
      import: {
        audiobooks: {
          pendingCount: this.importQueueService.getAudiobookPendingCount(),
          pendingNames: this.importQueueService.getAudiobookPendingNames(),
        },
        ebooks: {
          pendingCount: this.importQueueService.getEbookPendingCount(),
          pendingNames: this.importQueueService.getEbookPendingNames(),
        },
      },
      hardcoverSync: {
        pendingCount: pendingHardcoverCount,
        failedCount: failedHardcoverItems.length,
      },
      scan:
        isScanning && scanProgress
          ? {
              isScanning: true,
              phase: scanProgress.phase,
              total: scanProgress.total,
              processed: scanProgress.processed,
              percentage:
                scanProgress.total > 0
                  ? Math.round(
                      (scanProgress.processed / scanProgress.total) * 100,
                    )
                  : 0,
              currentFile: scanProgress.currentFile,
            }
          : { isScanning: false },
    };
  }
}
