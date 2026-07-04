import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppDataService } from '../app-data/app-data.service';
import { WsEventsService, TtsTaskStatus } from '../events/ws-events.service';
import { TtsApiClient, TtsConnectionResult } from './tts-api.client';
import * as schema from './schema';
import { ttsGenerationJobs, TTS_ACTIVE_JOB_STATUSES } from './schema';
import { ebooks } from '../ebooks/schema';
import { audiobooks } from '../audiobooks/schema';

type Database = NodePgDatabase<
  typeof schema & { ebooks: typeof ebooks; audiobooks: typeof audiobooks }
>;

export type TtsJob = typeof ttsGenerationJobs.$inferSelect;

export interface TtsStatusInfo {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
  apiKeySet: boolean;
  voice: string;
  speed: number;
  model: string;
}

export interface TtsJobListItem {
  id: string;
  ebookId: string;
  ebookTitle: string | null;
  audiobookId: string | null;
  status: TtsJob['status'];
  voice: string;
  totalChapters: number | null;
  completedChapters: number;
  currentChapterTitle: string | null;
  errorMessage: string | null;
  warningMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

const IN_FLIGHT_STATUSES = [
  'extracting',
  'generating',
  'assembling',
  'importing',
] as const;

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly appSettings: AppSettingsService,
    private readonly appData: AppDataService,
    private readonly wsEvents: WsEventsService,
  ) {}

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  async getStatus(): Promise<TtsStatusInfo> {
    const config = await this.appSettings.getTtsConfig();
    return {
      enabled: config.enabled,
      configured: !!config.baseUrl,
      baseUrl: config.baseUrl,
      apiKeySet: !!config.apiKey,
      voice: config.voice,
      speed: config.speed,
      model: config.model,
    };
  }

  async updateConfig(updates: {
    enabled?: boolean;
    baseUrl?: string | null;
    apiKey?: string | null;
    voice?: string;
    speed?: number;
    model?: string;
  }): Promise<TtsStatusInfo> {
    await this.appSettings.updateSettings({
      ...(updates.enabled !== undefined && { ttsEnabled: updates.enabled }),
      ...(updates.baseUrl !== undefined && {
        ttsBaseUrl: updates.baseUrl?.trim() || null,
      }),
      ...(updates.apiKey !== undefined && {
        ttsApiKey: updates.apiKey || null,
      }),
      ...(updates.voice !== undefined && { ttsVoice: updates.voice }),
      ...(updates.speed !== undefined && { ttsSpeed: updates.speed }),
      ...(updates.model !== undefined && { ttsModel: updates.model }),
    });
    return this.getStatus();
  }

  /** Test a connection without persisting anything. */
  async validateConnection(params: {
    baseUrl: string;
    apiKey?: string | null;
    voice?: string;
    model?: string;
  }): Promise<TtsConnectionResult> {
    const config = await this.appSettings.getTtsConfig();
    const client = new TtsApiClient(params.baseUrl, params.apiKey);
    return client.testConnection(
      params.voice || config.voice,
      params.model || config.model,
    );
  }

  /** Voices from the saved configuration (null = server can't list them). */
  async getVoices(): Promise<string[] | null> {
    const client = await this.createClientFromConfig();
    return client.listVoices();
  }

  /** A few spoken words so admins can audition a voice before generating. */
  async previewVoice(voice?: string): Promise<Buffer> {
    const config = await this.appSettings.getTtsConfig();
    const client = await this.createClientFromConfig();
    return client.createSpeech("Hi there! This is how I'll sound.", {
      model: config.model,
      voice: voice?.trim() || config.voice,
      speed: config.speed,
    });
  }

  /** Build a client from the saved config; throws 412 when unconfigured. */
  async createClientFromConfig(): Promise<TtsApiClient> {
    const config = await this.appSettings.getTtsConfig();
    if (!config.baseUrl) {
      throw new PreconditionFailedException('TTS server URL is not configured');
    }
    return new TtsApiClient(config.baseUrl, config.apiKey);
  }

  // -------------------------------------------------------------------------
  // Jobs
  // -------------------------------------------------------------------------

  async createJob(
    ebookId: string,
    requestedBy: string,
    voice?: string,
  ): Promise<TtsJob> {
    const config = await this.appSettings.getTtsConfig();
    if (!config.enabled || !config.baseUrl) {
      throw new PreconditionFailedException(
        'TTS generation is not enabled or configured',
      );
    }

    const audiobookLibraryPath =
      await this.appSettings.getAudiobookLibraryPath();
    if (!audiobookLibraryPath) {
      throw new PreconditionFailedException(
        'Audiobook library path is not configured',
      );
    }

    const [ebook] = await this.db
      .select({
        id: ebooks.id,
        title: ebooks.title,
        format: ebooks.format,
        status: ebooks.status,
      })
      .from(ebooks)
      .where(eq(ebooks.id, ebookId))
      .limit(1);

    if (!ebook) {
      throw new NotFoundException('Ebook not found');
    }
    if (ebook.status !== 'available') {
      throw new BadRequestException('Ebook file is not available');
    }
    if (ebook.format !== 'epub') {
      throw new BadRequestException(
        'Audiobook generation is only supported for EPUB ebooks',
      );
    }

    const [existingAudiobook] = await this.db
      .select({ id: audiobooks.id })
      .from(audiobooks)
      .where(
        and(
          eq(audiobooks.generatedFromEbookId, ebookId),
          ne(audiobooks.status, 'missing'),
        ),
      )
      .limit(1);
    if (existingAudiobook) {
      throw new ConflictException(
        'An audiobook has already been generated from this ebook',
      );
    }

    try {
      const [job] = await this.db
        .insert(ttsGenerationJobs)
        .values({
          ebookId,
          voice: voice?.trim() || config.voice,
          speed: config.speed,
          model: config.model,
          requestedBy,
        })
        .returning();

      this.logger.log(
        `Queued TTS generation for ebook "${ebook.title}" (job ${job.id})`,
      );
      await this.emitQueueStatus();
      return job;
    } catch (error) {
      // Unique partial index: one active job per ebook
      if (
        error instanceof Error &&
        error.message.includes('tts_jobs_active_ebook_uq')
      ) {
        throw new ConflictException(
          'A generation job is already active for this ebook',
        );
      }
      throw error;
    }
  }

  async listJobs(limit = 50): Promise<TtsJobListItem[]> {
    const rows = await this.db
      .select({
        id: ttsGenerationJobs.id,
        ebookId: ttsGenerationJobs.ebookId,
        ebookTitle: ebooks.title,
        audiobookId: ttsGenerationJobs.audiobookId,
        status: ttsGenerationJobs.status,
        voice: ttsGenerationJobs.voice,
        totalChapters: ttsGenerationJobs.totalChapters,
        completedChapters: ttsGenerationJobs.completedChapters,
        currentChapterTitle: ttsGenerationJobs.currentChapterTitle,
        errorMessage: ttsGenerationJobs.errorMessage,
        warningMessage: ttsGenerationJobs.warningMessage,
        createdAt: ttsGenerationJobs.createdAt,
        startedAt: ttsGenerationJobs.startedAt,
        finishedAt: ttsGenerationJobs.finishedAt,
      })
      .from(ttsGenerationJobs)
      .leftJoin(ebooks, eq(ttsGenerationJobs.ebookId, ebooks.id))
      .orderBy(desc(ttsGenerationJobs.createdAt))
      .limit(limit);
    return rows;
  }

  /** Active job for a specific ebook, if any (pending or in flight). */
  async getActiveJobForEbook(ebookId: string): Promise<TtsJob | null> {
    const [job] = await this.db
      .select()
      .from(ttsGenerationJobs)
      .where(
        and(
          eq(ttsGenerationJobs.ebookId, ebookId),
          inArray(ttsGenerationJobs.status, [...TTS_ACTIVE_JOB_STATUSES]),
        ),
      )
      .limit(1);
    return job ?? null;
  }

  async cancelJob(id: string): Promise<TtsJob> {
    const job = await this.getJob(id);

    if (job.status === 'pending') {
      const [updated] = await this.db
        .update(ttsGenerationJobs)
        .set({ status: 'cancelled', finishedAt: new Date() })
        .where(
          and(
            eq(ttsGenerationJobs.id, id),
            eq(ttsGenerationJobs.status, 'pending'),
          ),
        )
        .returning();
      if (updated) {
        await this.deleteJobTempDir(id);
        await this.emitQueueStatus();
        return updated;
      }
      // Raced with the processor picking it up - fall through to soft cancel
    } else if (
      job.status === 'completed' ||
      job.status === 'failed' ||
      job.status === 'cancelled'
    ) {
      throw new BadRequestException('Job is already finished');
    }

    // In-flight: ask the processor to stop between chunks
    const [updated] = await this.db
      .update(ttsGenerationJobs)
      .set({ cancelRequested: true })
      .where(eq(ttsGenerationJobs.id, id))
      .returning();
    return updated;
  }

  async retryJob(id: string): Promise<TtsJob> {
    const job = await this.getJob(id);
    if (job.status !== 'failed') {
      throw new BadRequestException('Only failed jobs can be retried');
    }

    // Temp artifacts (finished chapter wavs) are kept on failure, so the
    // retried job resumes where it stopped.
    const [updated] = await this.db
      .update(ttsGenerationJobs)
      .set({
        status: 'pending',
        cancelRequested: false,
        errorMessage: null,
        finishedAt: null,
      })
      .where(eq(ttsGenerationJobs.id, id))
      .returning();
    await this.emitQueueStatus();
    return updated;
  }

  async dismissJob(id: string): Promise<void> {
    const job = await this.getJob(id);
    if (
      job.status !== 'completed' &&
      job.status !== 'failed' &&
      job.status !== 'cancelled'
    ) {
      throw new BadRequestException('Cannot dismiss a job that is in progress');
    }
    await this.db.delete(ttsGenerationJobs).where(eq(ttsGenerationJobs.id, id));
    await this.deleteJobTempDir(id);
    await this.emitQueueStatus();
  }

  async getJob(id: string): Promise<TtsJob> {
    const [job] = await this.db
      .select()
      .from(ttsGenerationJobs)
      .where(eq(ttsGenerationJobs.id, id))
      .limit(1);
    if (!job) {
      throw new NotFoundException('TTS job not found');
    }
    return job;
  }

  // -------------------------------------------------------------------------
  // Queue status (tasks indicator + WebSocket)
  // -------------------------------------------------------------------------

  async getQueueStatus(): Promise<TtsTaskStatus> {
    const [inFlight] = await this.db
      .select({
        jobId: ttsGenerationJobs.id,
        ebookId: ttsGenerationJobs.ebookId,
        ebookTitle: ebooks.title,
        status: ttsGenerationJobs.status,
        totalChapters: ttsGenerationJobs.totalChapters,
        completedChapters: ttsGenerationJobs.completedChapters,
        currentChapterTitle: ttsGenerationJobs.currentChapterTitle,
      })
      .from(ttsGenerationJobs)
      .leftJoin(ebooks, eq(ttsGenerationJobs.ebookId, ebooks.id))
      .where(inArray(ttsGenerationJobs.status, [...IN_FLIGHT_STATUSES]))
      .limit(1);

    const [counts] = await this.db
      .select({
        pending: sql<number>`count(*) filter (where ${ttsGenerationJobs.status} = 'pending')`,
        failed: sql<number>`count(*) filter (where ${ttsGenerationJobs.status} = 'failed')`,
      })
      .from(ttsGenerationJobs);

    return {
      active: inFlight
        ? {
            jobId: inFlight.jobId,
            ebookId: inFlight.ebookId,
            ebookTitle: inFlight.ebookTitle ?? 'Unknown ebook',
            phase: inFlight.status as
              | 'extracting'
              | 'generating'
              | 'assembling'
              | 'importing',
            totalChapters: inFlight.totalChapters,
            completedChapters: inFlight.completedChapters,
            percentage: inFlight.totalChapters
              ? Math.round(
                  (inFlight.completedChapters / inFlight.totalChapters) * 100,
                )
              : null,
            currentChapterTitle: inFlight.currentChapterTitle,
          }
        : null,
      pendingCount: Number(counts?.pending ?? 0),
      failedCount: Number(counts?.failed ?? 0),
    };
  }

  async emitQueueStatus(): Promise<void> {
    try {
      const status = await this.getQueueStatus();
      this.wsEvents.ttsGenerationStatusUpdated(status);
    } catch (error) {
      this.logger.warn(`Failed to emit TTS queue status: ${String(error)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async deleteJobTempDir(jobId: string): Promise<void> {
    const dir = this.appData.getTtsJobTempPath(jobId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(`Failed to delete temp dir ${dir}: ${String(error)}`);
    }
  }
}
