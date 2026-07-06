jest.mock('./announcements.service', () => ({
  AnnouncementsService: class AnnouncementsService {},
}));

import { AnnouncementsAdminController } from './announcements-admin.controller';

function createController() {
  const service = {
    findAll: jest.fn().mockResolvedValue([{ id: 'announcement-1' }]),
    create: jest.fn().mockResolvedValue({ id: 'announcement-1' }),
    update: jest.fn().mockResolvedValue({ id: 'announcement-1', title: 'New' }),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new AnnouncementsAdminController(service as any),
    service,
  };
}

describe('AnnouncementsAdminController', () => {
  it('lists all announcements', async () => {
    const { controller, service } = createController();

    await expect(controller.findAll()).resolves.toEqual([
      { id: 'announcement-1' },
    ]);
    expect(service.findAll).toHaveBeenCalledWith();
  });

  it('creates announcements as the current user', async () => {
    const { controller, service } = createController();
    const dto = { title: 'Hello' } as any;

    await expect(
      controller.create(dto, { id: 'admin-1' } as any),
    ).resolves.toEqual({ id: 'announcement-1' });
    expect(service.create).toHaveBeenCalledWith(dto, 'admin-1');
  });

  it('updates announcements', async () => {
    const { controller, service } = createController();
    const dto = { title: 'New' } as any;

    await expect(controller.update('announcement-1', dto)).resolves.toEqual({
      id: 'announcement-1',
      title: 'New',
    });
    expect(service.update).toHaveBeenCalledWith('announcement-1', dto);
  });

  it('deletes announcements', async () => {
    const { controller, service } = createController();

    await controller.delete('announcement-1');

    expect(service.delete).toHaveBeenCalledWith('announcement-1');
  });
});
