import { BadRequestException } from '@nestjs/common';

jest.mock('./genres-admin.service', () => ({
  GenresAdminService: class GenresAdminService {},
}));

import { GenresAdminController } from './genres-admin.controller';

function createController() {
  const service = {
    findAll: jest.fn().mockResolvedValue([{ id: 'genre-1' }]),
    rename: jest.fn().mockResolvedValue({ success: true }),
    merge: jest.fn().mockResolvedValue({ success: true }),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new GenresAdminController(service as any),
    service,
  };
}

describe('GenresAdminController', () => {
  it('wraps all genres in a response object', async () => {
    const { controller, service } = createController();

    await expect(controller.findAll()).resolves.toEqual({
      genres: [{ id: 'genre-1' }],
    });
    expect(service.findAll).toHaveBeenCalledWith();
  });

  it('renames genres', async () => {
    const { controller, service } = createController();

    await expect(
      controller.rename('genre-1', { name: 'Sci-Fi' }),
    ).resolves.toEqual({ success: true });
    expect(service.rename).toHaveBeenCalledWith('genre-1', 'Sci-Fi');
  });

  it('merges genres unless source and target are the same', async () => {
    const { controller, service } = createController();

    await expect(controller.merge('genre-1', 'genre-2')).resolves.toEqual({
      success: true,
    });
    expect(service.merge).toHaveBeenCalledWith('genre-1', 'genre-2');
    await expect(controller.merge('genre-1', 'genre-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('deletes genres', async () => {
    const { controller, service } = createController();

    await controller.delete('genre-1');

    expect(service.delete).toHaveBeenCalledWith('genre-1');
  });
});
