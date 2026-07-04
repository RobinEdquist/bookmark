import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TTS_JOB_STATUSES = [
  'pending',
  'extracting',
  'generating',
  'assembling',
  'importing',
  'completed',
  'failed',
  'cancelled',
] as const;

type TtsJobStatus = (typeof TTS_JOB_STATUSES)[number];

/**
 * Full status returned to admins. Non-admins receive only the fields present
 * on {@link TtsStatusPublicDto}; the API key value itself is never returned.
 */
export class TtsStatusDto {
  @ApiProperty({
    example: true,
    description: 'Whether AI audiobook generation is enabled',
  })
  enabled!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether a TTS server URL is configured',
  })
  configured!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'http://tts:8880',
    description: 'Base URL of the configured TTS server (admin only)',
  })
  baseUrl!: string | null;

  @ApiProperty({
    example: false,
    description: 'Whether an API key is stored (admin only)',
  })
  apiKeySet!: boolean;

  @ApiProperty({ example: 'af_heart', description: 'Active narration voice' })
  voice!: string;

  @ApiProperty({
    example: 1.0,
    description: 'Active narration speed multiplier',
  })
  speed!: number;

  @ApiProperty({ example: 'kokoro', description: 'Active TTS model name' })
  model!: string;
}

/** Reduced status shape returned to non-admins with the generate permission. */
export class TtsStatusPublicDto {
  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ example: true })
  configured!: boolean;

  @ApiProperty({ example: 'af_heart' })
  voice!: string;

  @ApiProperty({ example: 'kokoro' })
  model!: string;
}

export class TtsValidateResponseDto {
  @ApiProperty({
    example: true,
    description: 'Whether the server is reachable and can synthesize speech',
  })
  ok!: boolean;

  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['af_heart', 'am_adam'],
    description:
      'Voices the server exposes, or null when it has no voice-listing endpoint',
  })
  voices!: string[] | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Connection refused',
    description: 'Error detail when the connection test failed',
  })
  error?: string;
}

export class TtsVoicesResponseDto {
  @ApiProperty({
    type: [String],
    nullable: true,
    example: ['af_heart', 'am_adam'],
    description:
      'Available voices, or null when the server has no voice-listing endpoint',
  })
  voices!: string[] | null;
}

/**
 * A generation job row. Returned by create/cancel/retry and (as an array) by
 * the admin job list.
 */
export class TtsJobDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'Source ebook id' })
  ebookId!: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Generated audiobook id, once import completes',
  })
  audiobookId!: string | null;

  @ApiProperty({ enum: TTS_JOB_STATUSES, example: 'pending' })
  status!: TtsJobStatus;

  @ApiProperty({
    example: 'af_heart',
    description: 'Voice snapshot at enqueue',
  })
  voice!: string;

  @ApiProperty({ example: 1.0, description: 'Speed snapshot at enqueue' })
  speed!: number;

  @ApiProperty({ example: 'kokoro', description: 'Model snapshot at enqueue' })
  model!: string;

  @ApiProperty({ type: Number, nullable: true, example: 24 })
  totalChapters!: number | null;

  @ApiProperty({ example: 0 })
  completedChapters!: number;

  @ApiProperty({ type: String, nullable: true, example: 'Chapter 3' })
  currentChapterTitle!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 512000 })
  totalCharacters!: number | null;

  @ApiProperty({
    example: false,
    description: 'Whether a soft cancel has been requested',
  })
  cancelRequested!: boolean;

  @ApiProperty({ type: String, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ type: String, nullable: true })
  warningMessage!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Id of the user who requested the job',
  })
  requestedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

/** A row in the admin job list (enriched with the ebook title). */
export class TtsJobListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ebookId!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Dune' })
  ebookTitle!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  audiobookId!: string | null;

  @ApiProperty({ enum: TTS_JOB_STATUSES, example: 'completed' })
  status!: TtsJobStatus;

  @ApiProperty({ example: 'af_heart' })
  voice!: string;

  @ApiProperty({ type: Number, nullable: true, example: 24 })
  totalChapters!: number | null;

  @ApiProperty({ example: 24 })
  completedChapters!: number;

  @ApiProperty({ type: String, nullable: true })
  currentChapterTitle!: string | null;

  @ApiProperty({ type: String, nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ type: String, nullable: true })
  warningMessage!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: Date | null;
}
