import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  EBOOK_GROUP_DESCRIPTION_MAX_LENGTH,
  EBOOK_GROUP_NAME_MAX_LENGTH,
  EBOOK_GROUP_ROLE_MAX_LENGTH,
} from '../ebook-groups.helpers';

function normalizeLabel(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim().replace(/\s+/g, ' ');
}

function blankToNull(value: unknown): unknown {
  if (value == null || typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function roleToNull(value: unknown): unknown {
  if (value == null || typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed;
}

/** Sort names are a single line. Blank clears the field. */
function optionalLabel(value: unknown): unknown {
  if (value == null || typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed;
}

export class ListEbookGroupsQueryDto {
  @ApiPropertyOptional({
    description: 'Literal substring search in the name or sort name',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['name', 'recentlyAdded'], default: 'name' })
  @IsOptional()
  @IsIn(['name', 'recentlyAdded'])
  sortBy?: 'name' | 'recentlyAdded';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({
    type: 'integer',
    default: 50,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ type: 'integer', default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class CreateEbookGroupDto {
  @ApiProperty({
    example: 'Curse of Strahd',
    minLength: 1,
    maxLength: EBOOK_GROUP_NAME_MAX_LENGTH,
    description:
      'Required nonblank name; surrounding and repeated whitespace is normalized',
  })
  @Transform(({ value }) => normalizeLabel(value))
  @IsString()
  @MinLength(1)
  @MaxLength(EBOOK_GROUP_NAME_MAX_LENGTH)
  name!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: EBOOK_GROUP_NAME_MAX_LENGTH,
    description:
      'Optional sorting label. Null or blank clears it; omission leaves it unchanged when updating.',
  })
  @IsOptional()
  @Transform(({ value }) => optionalLabel(value))
  @IsString()
  @MaxLength(EBOOK_GROUP_NAME_MAX_LENGTH)
  sortName?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: EBOOK_GROUP_DESCRIPTION_MAX_LENGTH,
    description:
      'Optional description. Null or blank clears it; omission leaves it unchanged when updating.',
  })
  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @IsString()
  @MaxLength(EBOOK_GROUP_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

export class UpdateEbookGroupDto {
  @ApiPropertyOptional({
    example: 'Curse of Strahd',
    minLength: 1,
    maxLength: EBOOK_GROUP_NAME_MAX_LENGTH,
    description:
      'Nonblank name when supplied; whitespace is normalized. Omit to leave unchanged.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) => normalizeLabel(value))
  @IsString()
  @MinLength(1)
  @MaxLength(EBOOK_GROUP_NAME_MAX_LENGTH)
  name?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: EBOOK_GROUP_NAME_MAX_LENGTH,
    description:
      'Optional sorting label. Null or blank clears it; omission leaves it unchanged when updating.',
  })
  @IsOptional()
  @Transform(({ value }) => optionalLabel(value))
  @IsString()
  @MaxLength(EBOOK_GROUP_NAME_MAX_LENGTH)
  sortName?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: EBOOK_GROUP_DESCRIPTION_MAX_LENGTH,
    description:
      'Optional description. Null or blank clears it; omission leaves it unchanged when updating.',
  })
  @IsOptional()
  @Transform(({ value }) => blankToNull(value))
  @IsString()
  @MaxLength(EBOOK_GROUP_DESCRIPTION_MAX_LENGTH)
  description?: string | null;
}

export class AddEbookGroupMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  ebookId!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: EBOOK_GROUP_ROLE_MAX_LENGTH,
    example: "Dungeon Master's Guide",
    description:
      'Free-text role; whitespace is normalized. Null or blank clears it. Omit to leave an existing role unchanged.',
  })
  @IsOptional()
  @Transform(({ value }) => roleToNull(value))
  @IsString()
  @MaxLength(EBOOK_GROUP_ROLE_MAX_LENGTH)
  role?: string | null;
}

export class UpdateEbookGroupMemberDto {
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: EBOOK_GROUP_ROLE_MAX_LENGTH,
    example: 'Scenario',
    description:
      'Free-text role; whitespace is normalized. Null or blank clears it.',
  })
  @Transform(({ value }) => roleToNull(value))
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(EBOOK_GROUP_ROLE_MAX_LENGTH)
  role!: string | null;
}

export class ReorderEbookGroupMembersDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'uuid' },
    uniqueItems: true,
    description:
      'Unique member ebook ids in the desired order. Omitted members are retained, including hidden or blacklisted members. An empty array leaves the order unchanged. Nonmembers are rejected.',
  })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ebookIds!: string[];
}
