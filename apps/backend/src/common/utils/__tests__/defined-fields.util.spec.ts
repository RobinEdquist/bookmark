import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';
import { definedFields } from '../defined-fields.util';

class ExampleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;
}

describe('definedFields', () => {
  it('drops declared fields the client did not send', () => {
    const dto = plainToInstance(ExampleDto, { title: 'Rogue' });
    // The instance carries every declared field, which is the trap
    expect(Object.keys(dto)).toEqual(['title', 'description']);

    expect(definedFields(dto)).toEqual({ title: 'Rogue' });
  });

  it('keeps null, which clears a field', () => {
    const dto = plainToInstance(ExampleDto, { description: null });
    expect(definedFields(dto)).toEqual({ description: null });
  });

  it('returns an empty object when nothing was sent', () => {
    expect(definedFields(plainToInstance(ExampleDto, {}))).toEqual({});
  });
});
