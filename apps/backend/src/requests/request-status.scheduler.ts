import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RequestsService } from './requests.service';

@Injectable()
export class RequestStatusScheduler {
  private readonly logger = new Logger(RequestStatusScheduler.name);

  constructor(private readonly requestsService: RequestsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async searchWaitingRequests() {
    try {
      await this.requestsService.searchWaitingRequests();
    } catch (error) {
      this.logger.error(`Failed to check waiting requests: ${error}`);
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async checkDownloadingRequests() {
    try {
      await this.requestsService.recoverStaleSubmissions();
    } catch (error) {
      this.logger.error(`Failed to recover interrupted submissions: ${error}`);
    }
    try {
      await this.requestsService.updateDownloadingStatuses();
    } catch (error) {
      this.logger.error(`Failed to check downloading requests: ${error}`);
    }
  }
}
