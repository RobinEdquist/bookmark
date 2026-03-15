import { NotFoundException } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import * as schema from './schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: any = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'orderBy',
    'innerJoin',
    'leftJoin',
    'returning',
    'set',
    'values',
  ];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  (self as any).then = (resolve: any, reject: any) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return self;
}

function createMockDb(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as any;
}

const USER_ID = 'user-1';
const ADMIN_ID = 'admin-1';
const ANNOUNCEMENT_ID = 'ann-1';

const mockAnnouncement = {
  id: ANNOUNCEMENT_ID,
  title: 'Test Announcement',
  message: 'This is a test announcement',
  isActive: true,
  createdBy: ADMIN_ID,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-01-15'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnnouncementsService', () => {
  // -----------------------------------------------------------------------
  // getActiveForUser
  // -----------------------------------------------------------------------
  describe('getActiveForUser', () => {
    it('returns active announcements when user has no dismissals', async () => {
      const activeAnnouncements = [
        {
          id: 'ann-1',
          title: 'Announcement 1',
          message: 'Message 1',
          createdAt: new Date('2026-01-15'),
        },
        {
          id: 'ann-2',
          title: 'Announcement 2',
          message: 'Message 2',
          createdAt: new Date('2026-01-14'),
        },
      ];

      // First select: dismissed IDs (empty)
      const dismissedChain = chainMock([]);
      // Second select: active announcements
      const activeChain = chainMock(activeAnnouncements);

      const select = jest
        .fn()
        .mockReturnValueOnce(dismissedChain)
        .mockReturnValueOnce(activeChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      const result = await service.getActiveForUser(USER_ID);

      expect(result).toEqual(activeAnnouncements);
      expect(select).toHaveBeenCalledTimes(2);
    });

    it('filters out dismissed announcements', async () => {
      const dismissedIds = [{ announcementId: 'ann-1' }];
      const activeAnnouncements = [
        {
          id: 'ann-2',
          title: 'Announcement 2',
          message: 'Message 2',
          createdAt: new Date('2026-01-14'),
        },
      ];

      const dismissedChain = chainMock(dismissedIds);
      const activeChain = chainMock(activeAnnouncements);

      const select = jest
        .fn()
        .mockReturnValueOnce(dismissedChain)
        .mockReturnValueOnce(activeChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      const result = await service.getActiveForUser(USER_ID);

      expect(result).toEqual(activeAnnouncements);
    });

    it('returns empty array when all announcements are dismissed', async () => {
      const dismissedIds = [
        { announcementId: 'ann-1' },
        { announcementId: 'ann-2' },
      ];

      const dismissedChain = chainMock(dismissedIds);
      const activeChain = chainMock([]);

      const select = jest
        .fn()
        .mockReturnValueOnce(dismissedChain)
        .mockReturnValueOnce(activeChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      const result = await service.getActiveForUser(USER_ID);

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // dismiss
  // -----------------------------------------------------------------------
  describe('dismiss', () => {
    it('creates a dismissal record when announcement exists', async () => {
      // First select: announcement exists
      const announcementChain = chainMock([{ id: ANNOUNCEMENT_ID }]);
      // Second select: not yet dismissed
      const dismissedChain = chainMock([]);

      const select = jest
        .fn()
        .mockReturnValueOnce(announcementChain)
        .mockReturnValueOnce(dismissedChain);

      const insertChain = chainMock(undefined);
      const insert = jest.fn().mockReturnValue(insertChain);

      const db = createMockDb({ select, insert });
      const service = new AnnouncementsService(db);

      const result = await service.dismiss(ANNOUNCEMENT_ID, USER_ID);

      expect(result).toEqual({ success: true });
      expect(insert).toHaveBeenCalledWith(schema.announcementDismissals);
    });

    it('throws NotFoundException when announcement does not exist', async () => {
      const announcementChain = chainMock([]);
      const select = jest.fn().mockReturnValue(announcementChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      await expect(
        service.dismiss('nonexistent', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns success without inserting when already dismissed', async () => {
      // First select: announcement exists
      const announcementChain = chainMock([{ id: ANNOUNCEMENT_ID }]);
      // Second select: already dismissed
      const existingChain = chainMock([{ id: 'dismissal-1' }]);

      const select = jest
        .fn()
        .mockReturnValueOnce(announcementChain)
        .mockReturnValueOnce(existingChain);

      const insert = jest.fn();
      const db = createMockDb({ select, insert });
      const service = new AnnouncementsService(db);

      const result = await service.dismiss(ANNOUNCEMENT_ID, USER_ID);

      expect(result).toEqual({ success: true });
      expect(insert).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------
  describe('findAll', () => {
    it('returns all announcements ordered by createdAt desc', async () => {
      const allAnnouncements = [
        { ...mockAnnouncement, id: 'ann-2', createdAt: new Date('2026-01-16') },
        { ...mockAnnouncement, id: 'ann-1', createdAt: new Date('2026-01-15') },
      ];

      const selectChain = chainMock(allAnnouncements);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      const result = await service.findAll();

      expect(result).toEqual(allAnnouncements);
      expect(result).toHaveLength(2);
    });

    it('returns empty array when no announcements exist', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe('create', () => {
    it('creates an announcement with isActive defaulting to true', async () => {
      const created = { ...mockAnnouncement };
      const insertChain = chainMock([created]);
      const insert = jest.fn().mockReturnValue(insertChain);
      const db = createMockDb({ insert });
      const service = new AnnouncementsService(db);

      const result = await service.create(
        { title: 'Test Announcement', message: 'This is a test announcement' },
        ADMIN_ID,
      );

      expect(result).toEqual(created);
      expect(insert).toHaveBeenCalledWith(schema.announcements);
      expect(insertChain.values).toHaveBeenCalledWith({
        title: 'Test Announcement',
        message: 'This is a test announcement',
        isActive: true,
        createdBy: ADMIN_ID,
      });
    });

    it('creates an inactive announcement when isActive is false', async () => {
      const created = { ...mockAnnouncement, isActive: false };
      const insertChain = chainMock([created]);
      const insert = jest.fn().mockReturnValue(insertChain);
      const db = createMockDb({ insert });
      const service = new AnnouncementsService(db);

      const result = await service.create(
        {
          title: 'Test Announcement',
          message: 'This is a test',
          isActive: false,
        },
        ADMIN_ID,
      );

      expect(result).toEqual(created);
      expect(insertChain.values).toHaveBeenCalledWith({
        title: 'Test Announcement',
        message: 'This is a test',
        isActive: false,
        createdBy: ADMIN_ID,
      });
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------
  describe('update', () => {
    it('updates an existing announcement title', async () => {
      // First select: announcement exists
      const existsChain = chainMock([{ id: ANNOUNCEMENT_ID }]);
      const select = jest.fn().mockReturnValue(existsChain);

      const updated = { ...mockAnnouncement, title: 'Updated Title' };
      const updateChain = chainMock([updated]);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, update });
      const service = new AnnouncementsService(db);

      const result = await service.update(ANNOUNCEMENT_ID, {
        title: 'Updated Title',
      });

      expect(result).toEqual(updated);
      expect(update).toHaveBeenCalledWith(schema.announcements);
      expect(updateChain.set).toHaveBeenCalledWith({ title: 'Updated Title' });
    });

    it('throws NotFoundException when announcement does not exist', async () => {
      const existsChain = chainMock([]);
      const select = jest.fn().mockReturnValue(existsChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      await expect(
        service.update('nonexistent', { title: 'Updated' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates isActive field', async () => {
      const existsChain = chainMock([{ id: ANNOUNCEMENT_ID }]);
      const select = jest.fn().mockReturnValue(existsChain);

      const updated = { ...mockAnnouncement, isActive: false };
      const updateChain = chainMock([updated]);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, update });
      const service = new AnnouncementsService(db);

      const result = await service.update(ANNOUNCEMENT_ID, { isActive: false });

      expect(result).toEqual(updated);
      expect(updateChain.set).toHaveBeenCalledWith({ isActive: false });
    });

    it('updates multiple fields at once', async () => {
      const existsChain = chainMock([{ id: ANNOUNCEMENT_ID }]);
      const select = jest.fn().mockReturnValue(existsChain);

      const updated = {
        ...mockAnnouncement,
        title: 'New Title',
        message: 'New Message',
        isActive: false,
      };
      const updateChain = chainMock([updated]);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, update });
      const service = new AnnouncementsService(db);

      const result = await service.update(ANNOUNCEMENT_ID, {
        title: 'New Title',
        message: 'New Message',
        isActive: false,
      });

      expect(result).toEqual(updated);
      expect(updateChain.set).toHaveBeenCalledWith({
        title: 'New Title',
        message: 'New Message',
        isActive: false,
      });
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------
  describe('delete', () => {
    it('deletes an existing announcement', async () => {
      const existsChain = chainMock([{ id: ANNOUNCEMENT_ID }]);
      const select = jest.fn().mockReturnValue(existsChain);

      const deleteChain = chainMock(undefined);
      const del = jest.fn().mockReturnValue(deleteChain);

      const db = createMockDb({ select, delete: del });
      const service = new AnnouncementsService(db);

      const result = await service.delete(ANNOUNCEMENT_ID);

      expect(result).toEqual({ success: true });
      expect(del).toHaveBeenCalledWith(schema.announcements);
    });

    it('throws NotFoundException when announcement does not exist', async () => {
      const existsChain = chainMock([]);
      const select = jest.fn().mockReturnValue(existsChain);
      const db = createMockDb({ select });
      const service = new AnnouncementsService(db);

      await expect(service.delete('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
