import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateComicSeriesDto,
  MoveComicBooksDto,
  MergeComicSeriesDto,
  UpdateComicBookDto,
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
