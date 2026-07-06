jest.mock('./users.service', () => ({
  UsersService: class UsersService {},
}));

jest.mock('./dto/update-theme.dto', () => ({
  UpdateThemeDto: class UpdateThemeDto {},
}));

import { UsersController } from './users.controller';

function createController() {
  const service = {
    findById: jest.fn().mockResolvedValue({ id: 'user-1' }),
    getLanguage: jest.fn().mockResolvedValue('sv'),
    updateLanguage: jest.fn().mockResolvedValue(undefined),
    getPermissions: jest.fn().mockResolvedValue({ canUpload: true }),
    getTheme: jest.fn().mockResolvedValue({
      primaryColor: 'blue',
      surfaceColor: 'zinc',
    }),
    updateTheme: jest.fn().mockResolvedValue(undefined),
    findAll: jest.fn().mockResolvedValue({ users: [], total: 0 }),
    create: jest.fn().mockResolvedValue({ id: 'new-user' }),
    update: jest.fn().mockResolvedValue({ id: 'target-user' }),
    ban: jest.fn().mockResolvedValue({ id: 'target-user', banned: true }),
    unban: jest.fn().mockResolvedValue({ id: 'target-user', banned: false }),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new UsersController({} as any, service as any),
    service,
  };
}

const user = { id: 'user-1', role: 'user' } as any;
const admin = { id: 'admin-1', role: 'admin' } as any;

describe('UsersController', () => {
  it('returns current user and session data', async () => {
    const { controller, service } = createController();

    await expect(controller.getMe(user)).resolves.toEqual({ id: 'user-1' });
    expect(controller.getSession(user)).toBe(user);
    expect(service.findById).toHaveBeenCalledWith('user-1');
  });

  it('gets and updates current user language', async () => {
    const { controller, service } = createController();

    await expect(controller.getLanguage(user)).resolves.toEqual({
      language: 'sv',
    });
    await expect(
      controller.updateLanguage(user, { language: 'en' }),
    ).resolves.toEqual({ success: true });
    expect(service.updateLanguage).toHaveBeenCalledWith('user-1', 'en');
  });

  it('gets current user permissions', async () => {
    const { controller } = createController();

    await expect(controller.getMyPermissions(user)).resolves.toEqual({
      canUpload: true,
    });
  });

  it('gets and updates current user theme', async () => {
    const { controller, service } = createController();

    await expect(controller.getTheme(user)).resolves.toEqual({
      primaryColor: 'blue',
      surfaceColor: 'zinc',
    });
    await expect(
      controller.updateTheme(user, {
        primaryColor: 'red',
        surfaceColor: 'pitch',
      }),
    ).resolves.toEqual({ success: true });
    expect(service.updateTheme).toHaveBeenCalledWith('user-1', 'red', 'pitch');
  });

  it('delegates admin user management operations', async () => {
    const { controller, service } = createController();

    await expect(controller.findAll('rob')).resolves.toEqual({
      users: [],
      total: 0,
    });
    await expect(
      controller.create({
        email: 'new@example.com',
        password: 'secret',
      } as any),
    ).resolves.toEqual({ id: 'new-user' });
    await expect(controller.findOne('target-user')).resolves.toEqual({
      id: 'user-1',
    });
    await expect(
      controller.update('target-user', { name: 'New' } as any, admin),
    ).resolves.toEqual({ id: 'target-user' });
    await expect(
      controller.ban('target-user', { reason: 'spam' } as any, admin),
    ).resolves.toEqual({ id: 'target-user', banned: true });
    await expect(controller.unban('target-user')).resolves.toEqual({
      id: 'target-user',
      banned: false,
    });
    await controller.delete('target-user', admin);

    expect(service.findAll).toHaveBeenCalledWith('rob');
    expect(service.update).toHaveBeenCalledWith(
      'target-user',
      { name: 'New' },
      'admin-1',
    );
    expect(service.ban).toHaveBeenCalledWith(
      'target-user',
      { reason: 'spam' },
      'admin-1',
    );
    expect(service.delete).toHaveBeenCalledWith('target-user', 'admin-1');
  });
});
