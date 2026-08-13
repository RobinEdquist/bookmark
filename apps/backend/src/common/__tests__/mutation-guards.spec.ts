// @thallesp/nestjs-better-auth is ESM-only; mock it like the other specs do
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class AuthService {},
  AuthModule: class AuthModule {},
  AllowAnonymous: () => () => undefined,
}));

import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AudiobooksController } from '../../audiobooks/audiobooks.controller';
import { EbooksController } from '../../ebooks/ebooks.controller';
import { ComicsController } from '../../comics/comics.controller';
import { CanEditMetadataGuard } from '../guards/can-edit-metadata.guard';
import { CanDeleteGuard } from '../guards/can-delete.guard';

/**
 * Regression tests for SAV-03: every state-changing audiobook/ebook/comic
 * route must carry an explicit permission guard. These assertions fail when a
 * mutation handler loses its guard (or a new one is added without asking for
 * one of these guards explicitly).
 */
function guardsOf(controller: object, method: string): unknown[] {
  const handler = (controller as Record<string, unknown>)[method];
  expect(typeof handler).toBe('function');
  return (
    (Reflect.getMetadata(GUARDS_METADATA, handler as object) as unknown[]) ?? []
  );
}

describe('mutation route authorization guards', () => {
  describe('AudiobooksController', () => {
    it.each([
      ['update', CanEditMetadataGuard],
      ['refreshChapters', CanEditMetadataGuard],
      ['importChapters', CanEditMetadataGuard],
      ['updateCover', CanEditMetadataGuard],
      ['delete', CanDeleteGuard],
    ])('%s requires %p', (method, guard) => {
      expect(guardsOf(AudiobooksController.prototype, method)).toContain(guard);
    });
  });

  describe('EbooksController', () => {
    it.each([
      ['update', CanEditMetadataGuard],
      ['updateCover', CanEditMetadataGuard],
      ['delete', CanDeleteGuard],
    ])('%s requires %p', (method, guard) => {
      expect(guardsOf(EbooksController.prototype, method)).toContain(guard);
    });
  });

  describe('ComicsController', () => {
    it.each([
      ['updateSeries', CanEditMetadataGuard],
      ['updateSeriesCover', CanEditMetadataGuard],
      ['updateBookCover', CanEditMetadataGuard],
      ['deleteSeries', CanDeleteGuard],
      ['deleteBook', CanDeleteGuard],
    ])('%s requires %p', (method, guard) => {
      expect(guardsOf(ComicsController.prototype, method)).toContain(guard);
    });
  });
});
