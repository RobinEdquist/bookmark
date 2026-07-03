import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  real,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { ebooks } from '../ebooks/schema';
import { audiobooks } from '../audiobooks/schema';

export const ttsJobStatusEnum = pgEnum('tts_job_status', [
  'pending',
  'extracting',
  'generating',
  'assembling',
  'importing',
  'completed',
  'failed',
  'cancelled',
]);

export const TTS_ACTIVE_JOB_STATUSES = [
  'pending',
  'extracting',
  'generating',
  'assembling',
  'importing',
] as const;

// Queue of ebook -> audiobook narration jobs
export const ttsGenerationJobs = pgTable(
  'tts_generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ebookId: uuid('ebook_id')
      .notNull()
      .references(() => ebooks.id, { onDelete: 'cascade' }),
    audiobookId: uuid('audiobook_id').references(() => audiobooks.id, {
      onDelete: 'set null',
    }),
    status: ttsJobStatusEnum('status').notNull().default('pending'),
    // Snapshot of TTS settings at enqueue time
    voice: text('voice').notNull(),
    speed: real('speed').notNull().default(1.0),
    model: text('model').notNull().default('kokoro'),
    totalChapters: integer('total_chapters'),
    completedChapters: integer('completed_chapters').notNull().default(0),
    currentChapterTitle: text('current_chapter_title'),
    totalCharacters: integer('total_characters'),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    errorMessage: text('error_message'),
    warningMessage: text('warning_message'),
    requestedBy: text('requested_by'),
    startedAt: timestamp('started_at'),
    finishedAt: timestamp('finished_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index('tts_jobs_status_idx').on(t.status),
    index('tts_jobs_ebook_id_idx').on(t.ebookId),
    index('tts_jobs_created_at_idx').on(t.createdAt),
    // At most one active job per ebook
    uniqueIndex('tts_jobs_active_ebook_uq')
      .on(t.ebookId)
      .where(
        sql`${t.status} IN ('pending', 'extracting', 'generating', 'assembling', 'importing')`,
      ),
  ],
);

export const ttsGenerationJobsRelations = relations(
  ttsGenerationJobs,
  ({ one }) => ({
    ebook: one(ebooks, {
      fields: [ttsGenerationJobs.ebookId],
      references: [ebooks.id],
    }),
    audiobook: one(audiobooks, {
      fields: [ttsGenerationJobs.audiobookId],
      references: [audiobooks.id],
    }),
  }),
);
