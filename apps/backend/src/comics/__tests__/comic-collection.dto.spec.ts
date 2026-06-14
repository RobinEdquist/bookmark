import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  CreateComicCollectionDto,
  AddCollectionSeriesDto,
  ReorderCollectionSeriesDto,
} from '../dto/comic-collection.dto';

describe('CreateComicCollectionDto', () => {
  it('passes with a name', async () => {
    expect(
      await validate(plainToInstance(CreateComicCollectionDto, { name: 'Saga' })),
    ).toHaveLength(0);
  });
  it('fails without a name', async () => {
    expect(
      (await validate(plainToInstance(CreateComicCollectionDto, {}))).length,
    ).toBeGreaterThan(0);
  });
});

describe('AddCollectionSeriesDto', () => {
  it('requires seriesId', async () => {
    expect(
      (await validate(plainToInstance(AddCollectionSeriesDto, {}))).length,
    ).toBeGreaterThan(0);
    expect(
      await validate(plainToInstance(AddCollectionSeriesDto, { seriesId: 's1' })),
    ).toHaveLength(0);
  });
});

describe('ReorderCollectionSeriesDto', () => {
  it('requires a non-empty seriesIds array', async () => {
    expect(
      (await validate(plainToInstance(ReorderCollectionSeriesDto, { seriesIds: [] }))).length,
    ).toBeGreaterThan(0);
    expect(
      await validate(plainToInstance(ReorderCollectionSeriesDto, { seriesIds: ['a', 'b'] })),
    ).toHaveLength(0);
  });
});
