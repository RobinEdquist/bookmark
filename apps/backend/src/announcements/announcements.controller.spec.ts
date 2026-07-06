jest.mock('./announcements.service', () => ({
  AnnouncementsService: class AnnouncementsService {},
}));

import { AnnouncementsController } from './announcements.controller';

describe('AnnouncementsController', () => {
  it('gets active announcements for the current user', async () => {
    const service = {
      getActiveForUser: jest.fn().mockResolvedValue([{ id: 'announcement-1' }]),
      dismiss: jest.fn(),
    };
    const controller = new AnnouncementsController(service as any);

    await expect(
      controller.getActive({ id: 'user-1' } as any),
    ).resolves.toEqual([{ id: 'announcement-1' }]);
    expect(service.getActiveForUser).toHaveBeenCalledWith('user-1');
  });

  it('dismisses an announcement for the current user', async () => {
    const service = {
      getActiveForUser: jest.fn(),
      dismiss: jest.fn().mockResolvedValue({ success: true }),
    };
    const controller = new AnnouncementsController(service as any);

    await expect(
      controller.dismiss('announcement-1', { id: 'user-1' } as any),
    ).resolves.toEqual({ success: true });
    expect(service.dismiss).toHaveBeenCalledWith('announcement-1', 'user-1');
  });
});
