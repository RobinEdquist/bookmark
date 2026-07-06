import { BadRequestException } from '@nestjs/common';

jest.mock('./filesystem.service', () => ({
  FilesystemService: class FilesystemService {},
}));

import { FilesystemController } from './filesystem.controller';

function createController() {
  const service = {
    getInitialPath: jest.fn().mockResolvedValue('/initial'),
    browse: jest.fn().mockResolvedValue({ path: '/initial', entries: [] }),
    createDirectory: jest.fn().mockResolvedValue({ path: '/new' }),
  };

  return {
    controller: new FilesystemController(service as any),
    service,
  };
}

describe('FilesystemController', () => {
  it('browses the requested path', async () => {
    const { controller, service } = createController();

    await expect(controller.browse('/books')).resolves.toEqual({
      path: '/initial',
      entries: [],
    });
    expect(service.getInitialPath).not.toHaveBeenCalled();
    expect(service.browse).toHaveBeenCalledWith('/books');
  });

  it('uses the initial path when no path is provided', async () => {
    const { controller, service } = createController();

    await controller.browse();

    expect(service.getInitialPath).toHaveBeenCalledWith();
    expect(service.browse).toHaveBeenCalledWith('/initial');
  });

  it('creates directories when a path is provided', async () => {
    const { controller, service } = createController();

    await expect(controller.createDirectory('/new')).resolves.toEqual({
      path: '/new',
    });
    expect(service.createDirectory).toHaveBeenCalledWith('/new');
  });

  it('rejects missing directory paths', async () => {
    const { controller } = createController();

    await expect(controller.createDirectory('')).rejects.toThrow(
      BadRequestException,
    );
  });
});
