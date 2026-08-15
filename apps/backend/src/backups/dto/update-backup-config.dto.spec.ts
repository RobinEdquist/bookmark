import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateBackupConfigDto } from './update-backup-config.dto';

describe('UpdateBackupConfigDto', () => {
  const validateInput = (input: object) =>
    validate(plainToInstance(UpdateBackupConfigDto, input));

  it('rejects JSON null for fields that do not support it', async () => {
    for (const input of [
      { enabled: null },
      { schedule: null },
      { retention: null },
    ]) {
      const errors = await validateInput(input);
      expect(errors).not.toHaveLength(0);
    }
  });

  it('accepts null path as a reset to the default location', async () => {
    await expect(validateInput({ path: null })).resolves.toHaveLength(0);
  });

  it('accepts a complete valid payload', async () => {
    await expect(
      validateInput({
        enabled: true,
        path: '/data/backups',
        schedule: '0 2 * * *',
        retention: 7,
      }),
    ).resolves.toHaveLength(0);
  });
});
