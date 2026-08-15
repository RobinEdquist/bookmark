import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../common/guards/admin.guard';
import { BackupsController } from './backups.controller';

describe('BackupsController', () => {
  const backupsService = {
    getOverview: jest.fn(),
    getConfig: jest.fn(),
    listBackups: jest.fn(),
    updateConfig: jest.fn(),
    createBackup: jest.fn(),
    importBackup: jest.fn(),
    getBackupFile: jest.fn(),
    deleteBackup: jest.fn(),
    restoreBackup: jest.fn(),
  };
  const controller = new BackupsController(backupsService as never);

  beforeEach(() => jest.clearAllMocks());

  it('protects every backup endpoint with the admin guard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      BackupsController,
    ) as unknown[];
    expect(guards).toContain(AdminGuard);
  });

  it('returns configuration and archives together', async () => {
    const overview = {
      config: { enabled: false },
      backups: [{ id: 'backup-1' }],
    };
    backupsService.getOverview.mockResolvedValue(overview);

    await expect(controller.getBackups()).resolves.toEqual(overview);
  });

  it('delegates configuration changes and archive creation', async () => {
    const dto = { enabled: true, retention: 5 };
    backupsService.updateConfig.mockResolvedValue({ enabled: true });
    backupsService.createBackup.mockResolvedValue({ id: 'backup-1' });

    await expect(controller.updateConfig(dto)).resolves.toEqual({
      enabled: true,
    });
    await expect(controller.createBackup()).resolves.toEqual({
      id: 'backup-1',
    });
    expect(backupsService.updateConfig).toHaveBeenCalledWith(dto);
  });
});
