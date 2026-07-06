import { ForbiddenException } from '@nestjs/common';

jest.mock('./user-profile.service', () => ({
  UserProfileService: class UserProfileService {},
}));

import { UserProfileController } from './user-profile.controller';

function createController() {
  const service = {
    getStats: jest.fn().mockResolvedValue({ totalBooksCompleted: 2 }),
    getActivity: jest.fn().mockResolvedValue({ year: 2026, days: [] }),
    getLibraryProgress: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getListeningHistory: jest
      .fn()
      .mockResolvedValue({ sessions: [], total: 0 }),
  };

  return {
    controller: new UserProfileController(service as any),
    service,
  };
}

const user = { id: 'user-1', role: 'user' } as any;
const admin = { id: 'admin-1', role: 'admin' } as any;

describe('UserProfileController', () => {
  it('resolves "me" to the current user for stats', async () => {
    const { controller, service } = createController();

    await expect(controller.getStats('me', user)).resolves.toEqual({
      totalBooksCompleted: 2,
    });
    expect(service.getStats).toHaveBeenCalledWith('user-1');
  });

  it('allows admins to view another user profile', async () => {
    const { controller, service } = createController();

    await controller.getStats('target-user', admin);

    expect(service.getStats).toHaveBeenCalledWith('target-user');
  });

  it('rejects non-admin access to another user profile', async () => {
    const { controller } = createController();

    await expect(controller.getStats('other-user', user)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('parses activity year and defaults invalid values', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
    const { controller, service } = createController();

    await controller.getActivity('me', '2025', user);
    await controller.getActivity('me', 'not-a-year', user);

    expect(service.getActivity).toHaveBeenNthCalledWith(1, 'user-1', 2025);
    expect(service.getActivity).toHaveBeenNthCalledWith(2, 'user-1', 2026);
    jest.useRealTimers();
  });

  it('normalizes library progress filters and pagination', async () => {
    const { controller, service } = createController();

    await controller.getLibraryProgress(
      'me',
      '500',
      '-10',
      'bad-type',
      'bad-status',
      'bad-sort',
      user,
    );

    expect(service.getLibraryProgress).toHaveBeenCalledWith(
      'user-1',
      100,
      0,
      'all',
      'all',
      'recent',
    );
  });

  it('passes valid library progress filters through', async () => {
    const { controller, service } = createController();

    await controller.getLibraryProgress(
      'user-1',
      '10',
      '5',
      'ebook',
      'completed',
      'title',
      user,
    );

    expect(service.getLibraryProgress).toHaveBeenCalledWith(
      'user-1',
      10,
      5,
      'ebook',
      'completed',
      'title',
    );
  });

  it('normalizes listening history pagination', async () => {
    const { controller, service } = createController();

    await controller.getListeningHistory('me', '0', '-1', user);

    expect(service.getListeningHistory).toHaveBeenCalledWith('user-1', 20, 0);
  });
});
