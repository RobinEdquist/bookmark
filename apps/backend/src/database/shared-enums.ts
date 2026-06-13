import { pgEnum } from 'drizzle-orm/pg-core';

// Shared enums used across multiple content types (audiobooks, ebooks)
export const coverSourceEnum = pgEnum('cover_source', [
  'embedded',
  'uploaded',
  'folder_image',
]);
