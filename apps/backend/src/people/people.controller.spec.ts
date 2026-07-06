import { NotFoundException } from '@nestjs/common';

jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
}));

import * as fs from 'fs/promises';
import { PeopleController } from './people.controller';

const mockedFs = jest.mocked(fs);

function createResponse() {
  return {
    set: jest.fn(),
    send: jest.fn(),
  };
}

describe('PeopleController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends person image bytes', async () => {
    mockedFs.readFile.mockResolvedValue(Buffer.from('image'));
    const appDataService = {
      getPersonImagePath: jest.fn().mockReturnValue('/images/person.jpg'),
    };
    const controller = new PeopleController(appDataService as any);
    const response = createResponse();

    await controller.getImage('person-1', response as any);

    expect(appDataService.getPersonImagePath).toHaveBeenCalledWith('person-1');
    expect(mockedFs.readFile).toHaveBeenCalledWith('/images/person.jpg');
    expect(response.set).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(response.send).toHaveBeenCalledWith(Buffer.from('image'));
  });

  it('throws NotFoundException when the image cannot be read', async () => {
    mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));
    const controller = new PeopleController({
      getPersonImagePath: jest.fn().mockReturnValue('/missing.jpg'),
    } as any);

    await expect(
      controller.getImage('person-1', createResponse() as any),
    ).rejects.toThrow(NotFoundException);
  });
});
