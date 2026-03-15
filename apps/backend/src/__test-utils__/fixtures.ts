/**
 * Entity factory functions for tests.
 *
 * Each `build*` function returns a full entity row with sensible defaults.
 * Pass an overrides object to customize specific fields.
 */

import type { audiobooks } from '../audiobooks/schema';
import type { ebooks } from '../ebooks/schema';
import type { user } from '../auth/schema';
import type {
  userAudiobookProgress,
  listeningSessions,
} from '../progress/schema';
import type { lists, listItems } from '../lists/schema';

// Infer row types from Drizzle table definitions
type Audiobook = typeof audiobooks.$inferSelect;
type Ebook = typeof ebooks.$inferSelect;
type User = typeof user.$inferSelect;
type ProgressRow = typeof userAudiobookProgress.$inferSelect;
type ListeningSession = typeof listeningSessions.$inferSelect;
type List = typeof lists.$inferSelect;
type ListItem = typeof listItems.$inferSelect;

let counter = 0;

/** Reset the internal counter (useful in beforeEach blocks). */
export function resetFixtureCounter(): void {
  counter = 0;
}

function nextId(prefix: string): string {
  counter += 1;
  return `test-${prefix}-${counter}`;
}

function now(): Date {
  return new Date('2026-01-15T12:00:00.000Z');
}

// ---------------------------------------------------------------------------
// Audiobook
// ---------------------------------------------------------------------------

export function buildAudiobook(overrides?: Partial<Audiobook>): Audiobook {
  const id = nextId('audiobook');
  return {
    id,
    title: `Audiobook ${id}`,
    subtitle: null,
    description: null,
    publisher: null,
    language: 'en',
    publishedDate: null,
    isbn: null,
    asin: null,
    duration: 3600,
    coverUrl: null,
    coverSource: null,
    filePath: `/library/audiobooks/${id}`,
    isExplicit: false,
    status: 'available',
    missingAt: null,
    manualFields: [],
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Ebook
// ---------------------------------------------------------------------------

export function buildEbook(overrides?: Partial<Ebook>): Ebook {
  const id = nextId('ebook');
  return {
    id,
    title: `Ebook ${id}`,
    subtitle: null,
    description: null,
    publisher: null,
    language: 'en',
    publishedDate: null,
    isbn: null,
    asin: null,
    pageCount: null,
    coverUrl: null,
    coverSource: null,
    filePath: `/library/ebooks/${id}`,
    fileName: `${id}.epub`,
    sizeBytes: 1_000_000,
    format: 'epub',
    isExplicit: false,
    status: 'available',
    missingAt: null,
    manualFields: [],
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export function buildUser(overrides?: Partial<User>): User {
  const id = nextId('user');
  return {
    id,
    name: `User ${id}`,
    email: `${id}@test.com`,
    emailVerified: false,
    image: null,
    language: 'en',
    primaryColor: 'orange',
    surfaceColor: 'espresso',
    createdAt: now(),
    updatedAt: now(),
    role: null,
    banned: false,
    banReason: null,
    banExpires: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export function buildProgressRow(
  overrides?: Partial<ProgressRow>,
): ProgressRow {
  const id = nextId('progress');
  return {
    id,
    userId: 'test-user-1',
    audiobookId: 'test-audiobook-1',
    currentPosition: 0,
    completed: false,
    completedAt: null,
    isHidden: false,
    startedAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Listening Session
// ---------------------------------------------------------------------------

export function buildListeningSession(
  overrides?: Partial<ListeningSession>,
): ListeningSession {
  const id = nextId('session');
  const startedAt = now();
  const endedAt = new Date(startedAt.getTime() + 300_000); // 5 minutes later
  return {
    id,
    userId: 'test-user-1',
    audiobookId: 'test-audiobook-1',
    startedAt,
    endedAt,
    durationSeconds: 300,
    startPosition: 0,
    endPosition: 300,
    createdAt: now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export function buildList(overrides?: Partial<List>): List {
  const id = nextId('list');
  return {
    id,
    userId: 'test-user-1',
    name: `List ${id}`,
    isPublic: false,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// List Item
// ---------------------------------------------------------------------------

export function buildListItem(overrides?: Partial<ListItem>): ListItem {
  const id = nextId('list-item');
  return {
    id,
    listId: 'test-list-1',
    itemType: 'audiobook',
    audiobookId: 'test-audiobook-1',
    ebookId: null,
    order: 0,
    createdAt: now(),
    ...overrides,
  };
}
