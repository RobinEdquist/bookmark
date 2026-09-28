import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  AddEbookGroupMemberDto,
  CreateEbookGroupDto,
  ReorderEbookGroupMembersDto,
  UpdateEbookGroupDto,
  UpdateEbookGroupMemberDto,
} from '../dto/ebook-group.dto';

const EBOOK_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_ID = '550e8400-e29b-41d4-a716-446655440001';

describe('CreateEbookGroupDto', () => {
  it('requires a name and clears a blank sort name', async () => {
    const dto = plainToInstance(CreateEbookGroupDto, {
      name: '  Curse of Strahd  ',
      sortName: '   ',
      description: '  ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe('Curse of Strahd');
    expect(dto.sortName).toBeNull();
    expect(dto.description).toBeNull();
  });

  it('rejects a missing name', async () => {
    expect(
      (await validate(plainToInstance(CreateEbookGroupDto, {}))).length,
    ).toBeGreaterThan(0);
  });
});

describe('UpdateEbookGroupDto', () => {
  it('rejects null names but permits omission', async () => {
    expect(
      await validate(plainToInstance(UpdateEbookGroupDto, { name: null })),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })]),
    );
    expect(
      await validate(plainToInstance(UpdateEbookGroupDto, {})),
    ).toHaveLength(0);
  });

  it('rejects a blank name and allows clearing the description', async () => {
    expect(
      (await validate(plainToInstance(UpdateEbookGroupDto, { name: '   ' })))
        .length,
    ).toBeGreaterThan(0);

    const dto = plainToInstance(UpdateEbookGroupDto, { description: '  ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.description).toBeNull();
  });
});

describe('AddEbookGroupMemberDto', () => {
  it('requires an ebook id and normalizes the role', async () => {
    const dto = plainToInstance(AddEbookGroupMemberDto, {
      ebookId: EBOOK_ID,
      role: '  Player   Guide  ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.role).toBe('Player Guide');
  });

  it('rejects a role longer than 120 characters', async () => {
    expect(
      (
        await validate(
          plainToInstance(AddEbookGroupMemberDto, {
            ebookId: EBOOK_ID,
            role: 'x'.repeat(121),
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('UpdateEbookGroupMemberDto', () => {
  it('allows null to clear a role and rejects a missing role', async () => {
    const cleared = plainToInstance(UpdateEbookGroupMemberDto, { role: null });
    expect(await validate(cleared)).toHaveLength(0);
    expect(cleared.role).toBeNull();

    expect(
      (await validate(plainToInstance(UpdateEbookGroupMemberDto, {}))).length,
    ).toBeGreaterThan(0);
  });
});

describe('ReorderEbookGroupMembersDto', () => {
  it('accepts a unique list and rejects duplicates', async () => {
    expect(
      await validate(
        plainToInstance(ReorderEbookGroupMembersDto, {
          ebookIds: [EBOOK_ID, OTHER_ID],
        }),
      ),
    ).toHaveLength(0);
    expect(
      (
        await validate(
          plainToInstance(ReorderEbookGroupMembersDto, {
            ebookIds: [EBOOK_ID, EBOOK_ID],
          }),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
});
