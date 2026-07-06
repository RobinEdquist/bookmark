jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: class AuthService {},
}));

jest.mock('./api-keys.service', () => ({
  ApiKeysService: class ApiKeysService {},
}));

import { ApiKeysController } from './api-keys.controller';

function createController() {
  const apiKeysService = {
    getUserApiKeys: jest.fn().mockResolvedValue([{ id: 'key-1' }]),
    createApiKey: jest.fn().mockResolvedValue({ key: 'bkmrk_secret' }),
    revokeApiKey: jest.fn().mockResolvedValue({ success: true }),
    revokeUserApiKeyByUserId: jest.fn().mockResolvedValue({ success: true }),
  };
  const authService = {
    instance: { api: {} },
  };

  return {
    controller: new ApiKeysController(
      apiKeysService as any,
      authService as any,
    ),
    apiKeysService,
    authService,
  };
}

const user = { id: 'user-1' } as any;

describe('ApiKeysController', () => {
  it('lists current user API keys', async () => {
    const { controller, apiKeysService } = createController();

    await expect(controller.getMyApiKeys(user)).resolves.toEqual([
      { id: 'key-1' },
    ]);
    expect(apiKeysService.getUserApiKeys).toHaveBeenCalledWith('user-1');
  });

  it('creates API keys using Better Auth instance', async () => {
    const { controller, apiKeysService, authService } = createController();

    await expect(
      controller.createApiKey({ name: 'Mobile' }, user),
    ).resolves.toEqual({ key: 'bkmrk_secret' });
    expect(apiKeysService.createApiKey).toHaveBeenCalledWith(
      'user-1',
      authService.instance,
      'Mobile',
    );
  });

  it('revokes current user API keys', async () => {
    const { controller, apiKeysService } = createController();

    await expect(controller.revokeApiKey('key-1', user)).resolves.toEqual({
      success: true,
    });
    expect(apiKeysService.revokeApiKey).toHaveBeenCalledWith('key-1', 'user-1');
  });

  it('lists and revokes user API keys as admin', async () => {
    const { controller, apiKeysService } = createController();

    await expect(controller.getUserApiKeys('target-user')).resolves.toEqual([
      { id: 'key-1' },
    ]);
    await expect(
      controller.revokeUserApiKeyById('target-user', 'key-1'),
    ).resolves.toEqual({ success: true });
    await expect(controller.revokeUserApiKey('target-user')).resolves.toEqual({
      success: true,
    });

    expect(apiKeysService.getUserApiKeys).toHaveBeenCalledWith('target-user');
    expect(apiKeysService.revokeApiKey).toHaveBeenCalledWith(
      'key-1',
      'target-user',
    );
    expect(apiKeysService.revokeUserApiKeyByUserId).toHaveBeenCalledWith(
      'target-user',
    );
  });
});
