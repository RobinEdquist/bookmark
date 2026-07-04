import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppDataService } from '../app-data/app-data.service';
import { WsEventsService } from '../events/ws-events.service';
import {
  EbookMetadataProvider,
  ExtractedEbookChapters,
} from '../library-watcher/metadata/ebook-metadata.provider';
import { MediaDetectorService } from '../library-watcher/media-detector.service';
import { MediaImporterService } from '../library-watcher/media-importer.service';
import { ImportQueueService } from '../library-watcher/import-queue.service';
import { LibraryScannerService } from '../library-watcher/library-scanner.service';
import { TtsService, TtsJob } from './tts.service';
import { TtsApiClient } from './tts-api.client';
import { M4bAssemblerService } from './m4b-assembler.service';
import { chunkText } from './utils/text-chunker';
import { concatWavBuffers, wavDurationMs } from './utils/wav';
import { FfChapter } from './utils/ffmetadata';
import * as ttsSchema from './schema';
import { ttsGenerationJobs } from './schema';
import * as ebooksSchema from '../ebooks/schema';
import * as audiobooksSchema from '../audiobooks/schema';

const PROCESS_INTERVAL_MS = 5000;
const POST_IMPORT_DELAY_MS = 5000;
const CHUNK_RETRY_DELAYS_MS = [1000, 5000, 15000];
const FINISHED_JOB_RETENTION_DAYS = 30;

// Disk guard: 24 kHz mono 16-bit wav = 48 kB/s at ~15 chars/s of speech,
// so ~3.2 kB per character, with 50% headroom for the m4b + concat copies.
const WAV_BYTES_PER_CHAR = 3200;
const DISK_HEADROOM_FACTOR = 1.5;

class JobCancelledError extends Error {
  constructor() {
    super('Job cancelled');
    this.name = 'JobCancelledError';
  }
}

type Database = NodePgDatabase<
  typeof ttsSchema & typeof ebooksSchema & typeof audiobooksSchema
>;

@Injectable()
export class TtsGenerationProcessor implements OnModuleInit {
  private readonly logger = new Logger(TtsGenerationProcessor.name);
  private isProcessing = false;
  private lastImportActiveTime = 0;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly appSettings: AppSettingsService,
    private readonly appData: AppDataService,
    private readonly wsEvents: WsEventsService,
    private readonly ttsService: TtsService,
    private readonly assembler: M4bAssemblerService,
    @Inject(forwardRef(() => EbookMetadataProvider))
    private readonly ebookMetadata: EbookMetadataProvider,
    @Inject(forwardRef(() => MediaDetectorService))
    private readonly mediaDetector: MediaDetectorService,
    @Inject(forwardRef(() => MediaImporterService))
    private readonly mediaImporter: MediaImporterService,
    @Inject(forwardRef(() => ImportQueueService))
    private readonly importQueue: ImportQueueService,
    @Inject(forwardRef(() => LibraryScannerService))
    private readonly libraryScanner: LibraryScannerService,
  ) {}

  async onModuleInit() {
    this.logger.log('TTS generation processor initialized');
    await this.recoverOrphanedJobs();
  }

  /**
   * Re-queue jobs a previous process left in flight (crash, redeploy,
   * restart). There is exactly one processor with single concurrency, so any
   * job still marked in-flight at boot is necessarily orphaned. Re-queued
   * jobs resume from their temp artifacts: extraction is cached and finished
   * chapter wavs are skipped, so at most the interrupted chapter is redone.
   * A pending cancelRequested flag survives and is honored on pickup.
   */
  private async recoverOrphanedJobs(): Promise<void> {
    try {
      const requeued = await this.db
        .update(ttsGenerationJobs)
        .set({ status: 'pending' })
        .where(
          inArray(ttsGenerationJobs.status, [
            'extracting',
            'generating',
            'assembling',
            'importing',
          ]),
        )
        .returning({ id: ttsGenerationJobs.id });
      if (requeued.length > 0) {
        this.logger.log(
          `Re-queued ${requeued.length} TTS job(s) orphaned by a previous shutdown`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to recover orphaned TTS jobs: ${String(error)}`,
      );
    }
  }

  @Interval(PROCESS_INTERVAL_MS)
  async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    const now = Date.now();

    // Give imports and scans the CPU and the DB - same courtesy as the
    // Hardcover sync processor.
    if (
      this.importQueue.getPendingCount() > 0 ||
      this.libraryScanner.isScanning()
    ) {
      this.lastImportActiveTime = now;
      return;
    }
    if (
      this.lastImportActiveTime > 0 &&
      now - this.lastImportActiveTime < POST_IMPORT_DELAY_MS
    ) {
      return;
    }

    const config = await this.appSettings.getTtsConfig();
    if (!config.enabled || !config.baseUrl) return;

    const [job] = await this.db
      .select()
      .from(ttsGenerationJobs)
      .where(eq(ttsGenerationJobs.status, 'pending'))
      .orderBy(asc(ttsGenerationJobs.createdAt))
      .limit(1);
    if (!job) return;

    this.isProcessing = true;
    try {
      await this.runJob(job, config);
    } catch (error) {
      // runJob handles its own failure bookkeeping; this is a last resort
      this.logger.error(`Unhandled TTS job error: ${String(error)}`);
    } finally {
      this.isProcessing = false;
      await this.ttsService.emitQueueStatus();
    }
  }

  // ---------------------------------------------------------------------
  // Job execution
  // ---------------------------------------------------------------------

  private async runJob(
    job: TtsJob,
    config: { baseUrl: string | null; apiKey: string | null },
  ): Promise<void> {
    const workDir = this.appData.getTtsJobTempPath(job.id);
    await fs.mkdir(workDir, { recursive: true });

    try {
      await this.updateJob(job.id, {
        startedAt: job.startedAt ?? new Date(),
      });

      // ----- extracting -------------------------------------------------
      await this.setPhase(job.id, 'extracting');
      const ebook = await this.loadEbook(job.ebookId);
      const extraction = await this.extractChapters(job, ebook, workDir);

      if (extraction.chapters.length === 0) {
        throw new Error(
          'No narratable text found in this ebook (image-only or empty EPUB)',
        );
      }

      const totalCharacters = extraction.chapters.reduce(
        (sum, c) => sum + c.characters,
        0,
      );
      const warningMessage =
        extraction.language && !/^en/i.test(extraction.language)
          ? `Ebook language is "${extraction.language}" - the configured voice may not support it`
          : null;
      await this.updateJob(job.id, {
        totalChapters: extraction.chapters.length,
        totalCharacters,
        warningMessage,
      });

      await this.ensureDiskSpace(totalCharacters);

      // ----- generating --------------------------------------------------
      await this.setPhase(job.id, 'generating');
      const client = new TtsApiClient(config.baseUrl!, config.apiKey);
      const wavFileNames = await this.generateChapterAudio(
        job,
        client,
        extraction,
        workDir,
      );

      // ----- assembling ---------------------------------------------------
      await this.setPhase(job.id, 'assembling');
      await this.checkCancelled(job.id);
      const m4bPath = await this.assembleM4b(
        job,
        ebook,
        extraction,
        wavFileNames,
        workDir,
      );

      // ----- importing ----------------------------------------------------
      await this.setPhase(job.id, 'importing');
      const audiobookId = await this.deliverAndImport(job, ebook, m4bPath);

      await this.updateJob(job.id, {
        status: 'completed',
        audiobookId,
        currentChapterTitle: null,
        finishedAt: new Date(),
      });
      await fs.rm(workDir, { recursive: true, force: true });

      this.wsEvents.audiobookUpdated(audiobookId);
      this.wsEvents.ebookUpdated(ebook.id);
      this.logger.log(
        `Generated audiobook ${audiobookId} from ebook "${ebook.title}" (job ${job.id})`,
      );
    } catch (error) {
      if (error instanceof JobCancelledError) {
        this.logger.log(`TTS job ${job.id} cancelled`);
        await this.updateJob(job.id, {
          status: 'cancelled',
          finishedAt: new Date(),
        });
        await fs.rm(workDir, { recursive: true, force: true });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`TTS job ${job.id} failed: ${message}`);
      // Keep the temp dir - finished chapter wavs make retries resume
      await this.updateJob(job.id, {
        status: 'failed',
        errorMessage: message.slice(0, 500),
        finishedAt: new Date(),
      });
    }
  }

  private async loadEbook(ebookId: string) {
    const [ebook] = await this.db
      .select()
      .from(ebooksSchema.ebooks)
      .where(eq(ebooksSchema.ebooks.id, ebookId))
      .limit(1);
    if (!ebook) {
      throw new Error('Ebook no longer exists');
    }
    return ebook;
  }

  private async extractChapters(
    job: TtsJob,
    ebook: typeof ebooksSchema.ebooks.$inferSelect,
    workDir: string,
  ): Promise<ExtractedEbookChapters> {
    const cachePath = path.join(workDir, 'chapters.json');

    // Resume support: reuse the extraction a previous (failed) run cached
    try {
      const cached = await fs.readFile(cachePath, 'utf-8');
      const parsed = JSON.parse(cached) as ExtractedEbookChapters;
      if (Array.isArray(parsed.chapters)) {
        return parsed;
      }
    } catch {
      // No usable cache - extract fresh
    }

    const ebookLibraryPath = await this.appSettings.getEbookLibraryPath();
    if (!ebookLibraryPath) {
      throw new Error('Ebook library path is not configured');
    }
    const epubPath = path.join(ebookLibraryPath, ebook.filePath);

    const extraction = await this.ebookMetadata.extractChapters(epubPath);
    await this.checkCancelled(job.id);
    await fs.writeFile(cachePath, JSON.stringify(extraction), 'utf-8');
    return extraction;
  }

  private async ensureDiskSpace(totalCharacters: number): Promise<void> {
    const required =
      totalCharacters * WAV_BYTES_PER_CHAR * DISK_HEADROOM_FACTOR;
    try {
      const stats = await fs.statfs(this.appData.getBasePath());
      const free = stats.bavail * stats.bsize;
      if (free < required) {
        const requiredGb = (required / 1024 ** 3).toFixed(1);
        const freeGb = (free / 1024 ** 3).toFixed(1);
        throw new Error(
          `Not enough disk space for generation: ~${requiredGb} GB needed, ${freeGb} GB free in the app data volume`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Not enough')) {
        throw error;
      }
      // statfs unsupported on this platform/volume - proceed without guard
      this.logger.warn(`Disk space check skipped: ${String(error)}`);
    }
  }

  private async generateChapterAudio(
    job: TtsJob,
    client: TtsApiClient,
    extraction: ExtractedEbookChapters,
    workDir: string,
  ): Promise<string[]> {
    const wavFileNames: string[] = [];

    for (let i = 0; i < extraction.chapters.length; i++) {
      const chapter = extraction.chapters[i];
      const fileName = `${String(i).padStart(3, '0')}.wav`;
      const filePath = path.join(workDir, fileName);
      wavFileNames.push(fileName);

      // Resume: skip chapters a previous run already synthesized
      const existing = await fs.stat(filePath).catch(() => null);
      if (existing && existing.size > 1024) {
        await this.updateJob(job.id, {
          completedChapters: i + 1,
          currentChapterTitle: chapter.title,
        });
        continue;
      }

      await this.updateJob(job.id, { currentChapterTitle: chapter.title });
      await this.ttsService.emitQueueStatus();

      const chunkBuffers: Buffer[] = [];
      for (const chunk of chunkText(chapter.text)) {
        await this.checkCancelled(job.id);
        chunkBuffers.push(await this.synthesizeWithRetry(client, chunk, job));
      }

      const chapterWav = concatWavBuffers(chunkBuffers);
      // Write via temp name so a crash never leaves a truncated .wav that a
      // resume would treat as complete
      await fs.writeFile(`${filePath}.part`, chapterWav);
      await fs.rename(`${filePath}.part`, filePath);

      await this.updateJob(job.id, { completedChapters: i + 1 });
      await this.ttsService.emitQueueStatus();
    }

    return wavFileNames;
  }

  private async synthesizeWithRetry(
    client: TtsApiClient,
    chunk: string,
    job: TtsJob,
  ): Promise<Buffer> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= CHUNK_RETRY_DELAYS_MS.length; attempt++) {
      // Abort the in-flight request as soon as a cancel comes in, instead of
      // letting a minutes-long CPU synthesis finish first.
      const abort = new AbortController();
      const cancelPoll = setInterval(() => {
        void this.checkCancelled(job.id).catch(() => abort.abort());
      }, 2000);
      try {
        return await client.createSpeech(
          chunk,
          {
            model: job.model,
            voice: job.voice,
            speed: job.speed,
          },
          abort.signal,
        );
      } catch (error) {
        if (abort.signal.aborted) {
          throw new JobCancelledError();
        }
        lastError = error;
        if (attempt < CHUNK_RETRY_DELAYS_MS.length) {
          this.logger.warn(
            `TTS chunk failed (attempt ${attempt + 1}), retrying: ${String(error)}`,
          );
          await new Promise((r) =>
            setTimeout(r, CHUNK_RETRY_DELAYS_MS[attempt]),
          );
          await this.checkCancelled(job.id);
        }
      } finally {
        clearInterval(cancelPoll);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async assembleM4b(
    job: TtsJob,
    ebook: typeof ebooksSchema.ebooks.$inferSelect,
    extraction: ExtractedEbookChapters,
    wavFileNames: string[],
    workDir: string,
  ): Promise<string> {
    // Chapter markers from the actual audio durations
    const chapters: FfChapter[] = [];
    let cursorMs = 0;
    for (let i = 0; i < wavFileNames.length; i++) {
      const buffer = await fs.readFile(path.join(workDir, wavFileNames[i]));
      const durationMs = wavDurationMs(buffer);
      chapters.push({
        title: extraction.chapters[i]?.title ?? `Chapter ${i + 1}`,
        startMs: cursorMs,
        endMs: cursorMs + durationMs,
      });
      cursorMs += durationMs;
    }

    const authors = await this.db
      .select({ name: audiobooksSchema.people.name })
      .from(ebooksSchema.ebookAuthors)
      .innerJoin(
        audiobooksSchema.people,
        eq(ebooksSchema.ebookAuthors.personId, audiobooksSchema.people.id),
      )
      .where(eq(ebooksSchema.ebookAuthors.ebookId, ebook.id))
      .orderBy(asc(ebooksSchema.ebookAuthors.order));

    const genres = await this.db
      .select({ name: audiobooksSchema.genres.name })
      .from(ebooksSchema.ebookGenres)
      .innerJoin(
        audiobooksSchema.genres,
        eq(ebooksSchema.ebookGenres.genreId, audiobooksSchema.genres.id),
      )
      .where(eq(ebooksSchema.ebookGenres.ebookId, ebook.id));

    const coverFileName = await this.prepareCover(ebook, workDir);

    const publishedYear = ebook.publishedDate
      ? String(ebook.publishedDate).slice(0, 4)
      : undefined;

    return this.assembler.assemble({
      workDir,
      wavFileNames,
      chapters,
      coverFileName,
      outputFileName: 'book.m4b',
      tags: {
        title: ebook.title,
        album: ebook.title,
        artist: authors.map((a) => a.name).join(', ') || undefined,
        // The importer reads narrator from the Composer tag (m4b convention)
        composer: `AI Narrator (${job.voice})`,
        genre: genres.map((g) => g.name).join(';') || undefined,
        date: publishedYear,
        comment: ebook.description?.slice(0, 1000),
        language: ebook.language ?? undefined,
      },
    });
  }

  /** Cover priority: stored app-data cover, then the EPUB's embedded one. */
  private async prepareCover(
    ebook: typeof ebooksSchema.ebooks.$inferSelect,
    workDir: string,
  ): Promise<string | undefined> {
    const coverFileName = 'cover.jpg';
    const target = path.join(workDir, coverFileName);

    const storedCover = this.appData.getEbookCoverPath(ebook.id);
    try {
      await fs.copyFile(storedCover, target);
      return coverFileName;
    } catch {
      // No stored cover - try the EPUB itself
    }

    try {
      const ebookLibraryPath = await this.appSettings.getEbookLibraryPath();
      if (!ebookLibraryPath) return undefined;
      const embedded = await this.ebookMetadata.extractCoverFromFile(
        path.join(ebookLibraryPath, ebook.filePath),
      );
      if (!embedded) return undefined;
      // ffmpeg probes content, not extensions - png data in cover.jpg is fine
      await fs.writeFile(target, embedded.data);
      return coverFileName;
    } catch {
      return undefined;
    }
  }

  private async deliverAndImport(
    job: TtsJob,
    ebook: typeof ebooksSchema.ebooks.$inferSelect,
    m4bPath: string,
  ): Promise<string> {
    const libraryPath = await this.appSettings.getAudiobookLibraryPath();
    if (!libraryPath) {
      throw new Error('Audiobook library path is not configured');
    }

    // Slug kept shell- and filesystem-safe: the metadata worker shell-quotes
    // the ffprobe path, so stick to [a-zA-Z0-9 _-]
    const safeTitle =
      ebook.title
        .replace(/[^a-zA-Z0-9 _-]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'Untitled';
    const slug = `${safeTitle} - ${ebook.id.slice(0, 8)}`;
    const destDir = path.join(libraryPath, 'generated', slug);
    await fs.mkdir(destDir, { recursive: true });

    // Dotfile copy first (invisible to the library watcher), then an atomic
    // same-directory rename to the final name.
    const tempName = path.join(destDir, `.tmp-${job.id}.m4b`);
    const finalPath = path.join(destDir, `${slug}.m4b`);
    await fs.copyFile(m4bPath, tempName);
    await fs.rename(tempName, finalPath);

    const unit = await this.mediaDetector.detectAudiobook(destDir);
    if (!unit) {
      throw new Error('Generated audiobook file was not detected for import');
    }

    const audiobookId = await this.mediaImporter.importAudiobook(
      unit,
      libraryPath,
    );
    if (!audiobookId) {
      throw new Error(
        'Import of the generated audiobook failed - see import errors',
      );
    }

    await this.linkToEbook(audiobookId, ebook);
    return audiobookId;
  }

  /** Record provenance and carry over ebook associations the m4b tags can't. */
  private async linkToEbook(
    audiobookId: string,
    ebook: typeof ebooksSchema.ebooks.$inferSelect,
  ): Promise<void> {
    await this.db
      .update(audiobooksSchema.audiobooks)
      .set({
        generatedFromEbookId: ebook.id,
        subtitle: ebook.subtitle,
        isExplicit: ebook.isExplicit,
      })
      .where(eq(audiobooksSchema.audiobooks.id, audiobookId));

    const seriesRows = await this.db
      .select({
        seriesId: ebooksSchema.ebookSeries.seriesId,
        order: ebooksSchema.ebookSeries.order,
      })
      .from(ebooksSchema.ebookSeries)
      .where(eq(ebooksSchema.ebookSeries.ebookId, ebook.id));
    if (seriesRows.length > 0) {
      await this.db
        .insert(audiobooksSchema.audiobookSeries)
        .values(
          seriesRows.map((row) => ({
            audiobookId,
            seriesId: row.seriesId,
            order: row.order,
          })),
        )
        .onConflictDoNothing();
    }

    const genreRows = await this.db
      .select({ genreId: ebooksSchema.ebookGenres.genreId })
      .from(ebooksSchema.ebookGenres)
      .where(eq(ebooksSchema.ebookGenres.ebookId, ebook.id));
    if (genreRows.length > 0) {
      await this.db
        .insert(audiobooksSchema.audiobookGenres)
        .values(genreRows.map((row) => ({ audiobookId, genreId: row.genreId })))
        .onConflictDoNothing();
    }

    const tagRows = await this.db
      .select({ tagId: ebooksSchema.ebookTags.tagId })
      .from(ebooksSchema.ebookTags)
      .where(eq(ebooksSchema.ebookTags.ebookId, ebook.id));
    if (tagRows.length > 0) {
      await this.db
        .insert(audiobooksSchema.audiobookTags)
        .values(tagRows.map((row) => ({ audiobookId, tagId: row.tagId })))
        .onConflictDoNothing();
    }
  }

  // ---------------------------------------------------------------------
  // Bookkeeping helpers
  // ---------------------------------------------------------------------

  private async setPhase(
    jobId: string,
    status: 'extracting' | 'generating' | 'assembling' | 'importing',
  ): Promise<void> {
    await this.checkCancelled(jobId);
    await this.updateJob(jobId, { status });
    await this.ttsService.emitQueueStatus();
  }

  private async updateJob(
    jobId: string,
    values: Partial<typeof ttsGenerationJobs.$inferInsert>,
  ): Promise<void> {
    await this.db
      .update(ttsGenerationJobs)
      .set(values)
      .where(eq(ttsGenerationJobs.id, jobId));
  }

  private async checkCancelled(jobId: string): Promise<void> {
    const [row] = await this.db
      .select({ cancelRequested: ttsGenerationJobs.cancelRequested })
      .from(ttsGenerationJobs)
      .where(eq(ttsGenerationJobs.id, jobId))
      .limit(1);
    if (!row || row.cancelRequested) {
      throw new JobCancelledError();
    }
  }

  /** Daily cleanup of old finished jobs and orphaned temp directories. */
  @Cron('0 4 * * *')
  async cleanup(): Promise<void> {
    try {
      const cutoff = new Date(
        Date.now() - FINISHED_JOB_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const deleted = await this.db
        .delete(ttsGenerationJobs)
        .where(
          and(
            inArray(ttsGenerationJobs.status, ['completed', 'cancelled']),
            lt(ttsGenerationJobs.finishedAt, cutoff),
          ),
        )
        .returning({ id: ttsGenerationJobs.id });
      if (deleted.length > 0) {
        this.logger.log(`Cleaned up ${deleted.length} old TTS jobs`);
      }

      // Remove temp dirs that no longer belong to a live or failed job
      const keep = new Set(
        (
          await this.db
            .select({ id: ttsGenerationJobs.id })
            .from(ttsGenerationJobs)
            .where(
              sql`${ttsGenerationJobs.status} NOT IN ('completed', 'cancelled')`,
            )
        ).map((row) => row.id),
      );

      const baseDir = this.appData.getTtsJobsTempPath();
      const entries = await fs.readdir(baseDir).catch(() => [] as string[]);
      for (const entry of entries) {
        if (!keep.has(entry)) {
          await fs.rm(path.join(baseDir, entry), {
            recursive: true,
            force: true,
          });
        }
      }
    } catch (error) {
      this.logger.error(`TTS cleanup failed: ${String(error)}`);
    }
  }
}
