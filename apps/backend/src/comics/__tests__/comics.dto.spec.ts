import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateComicSeriesDto,
  ListComicSeriesQueryDto,
  MoveComicBooksDto,
  MergeComicSeriesDto,
  UpdateComicBookDto,
  UpdateComicSeriesDto,
} from '../dto/comics.dto';

describe('MoveComicBooksDto', () => {
  it('passes with a non-empty bookIds array and a targetSeriesId', async () => {
    const dto = plainToInstance(MoveComicBooksDto, {
      bookIds: ['b1', 'b2'],
      targetSeriesId: 's1',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails when bookIds is empty', async () => {
    const dto = plainToInstance(MoveComicBooksDto, {
      bookIds: [],
      targetSeriesId: 's1',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it('fails when targetSeriesId is missing', async () => {
    const dto = plainToInstance(MoveComicBooksDto, { bookIds: ['b1'] });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('MergeComicSeriesDto', () => {
  it('passes with sourceSeriesIds and targetSeriesId', async () => {
    const dto = plainToInstance(MergeComicSeriesDto, {
      sourceSeriesIds: ['s1'],
      targetSeriesId: 's2',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails when sourceSeriesIds is empty', async () => {
    const dto = plainToInstance(MergeComicSeriesDto, {
      sourceSeriesIds: [],
      targetSeriesId: 's2',
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('UpdateComicBookDto collects', () => {
  it('accepts a collects descriptor', async () => {
    const dto = plainToInstance(UpdateComicBookDto, { collects: '#1-54' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts omitted collects', async () => {
    const dto = plainToInstance(UpdateComicBookDto, {});
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts null collects', async () => {
    const dto = plainToInstance(UpdateComicBookDto, { collects: null });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('UpdateComicBookDto collects validation', () => {
  it('accepts a valid issue-list', async () => {
    const dto = plainToInstance(UpdateComicBookDto, {
      collects: '1-18, 26, 52, 132',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts null and omitted', async () => {
    expect(
      await validate(plainToInstance(UpdateComicBookDto, { collects: null })),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(UpdateComicBookDto, {})),
    ).toHaveLength(0);
  });

  it('rejects unrecognized tokens', async () => {
    const dto = plainToInstance(UpdateComicBookDto, { collects: '1-10, E^12' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('CreateComicSeriesDto', () => {
  it('passes with a title', async () => {
    const dto = plainToInstance(CreateComicSeriesDto, { title: 'Saga' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('fails without a title', async () => {
    const dto = plainToInstance(CreateComicSeriesDto, {});
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('UpdateComicSeriesDto mainCharacters', () => {
  it('accepts up to three names', async () => {
    const dto = plainToInstance(UpdateComicSeriesDto, {
      mainCharacters: ['Wolverine', 'Captain America', 'X-Men'],
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('accepts an empty array (clears them)', async () => {
    const dto = plainToInstance(UpdateComicSeriesDto, { mainCharacters: [] });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects more than three names', async () => {
    const dto = plainToInstance(UpdateComicSeriesDto, {
      mainCharacters: ['A', 'B', 'C', 'D'],
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('mainCharacters');
  });

  it('rejects non-string entries', async () => {
    const dto = plainToInstance(UpdateComicSeriesDto, {
      mainCharacters: ['Wolverine', 42],
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});

describe('ListComicSeriesQueryDto mainCharacterId', () => {
  it('accepts a uuid', async () => {
    const dto = plainToInstance(ListComicSeriesQueryDto, {
      mainCharacterId: '7f6c2b1e-4d2a-4c4e-9a7b-2f0f3c1d5e6a',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a value that is not a uuid', async () => {
    const dto = plainToInstance(ListComicSeriesQueryDto, {
      mainCharacterId: 'wolverine',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('mainCharacterId');
  });
});
