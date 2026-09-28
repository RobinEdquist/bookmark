import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EbookGroupMemberDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: "Player's Handbook" })
  title!: string;

  @ApiProperty({ nullable: true, type: String })
  coverUrl!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'Player Guide',
    description: 'Free-text role within the group',
  })
  role!: string | null;

  @ApiProperty({ type: 'integer', minimum: 0, example: 0 })
  position!: number;

  @ApiProperty({
    enum: ['available', 'missing', 'importing', 'hidden'],
    example: 'available',
  })
  status!: string;

  @ApiProperty({ type: [String], example: ['Wizards of the Coast'] })
  authors!: string[];
}

export class EbookGroupListItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Curse of Strahd' })
  name!: string;

  @ApiProperty({ type: 'integer', minimum: 0, example: 6 })
  ebookCount!: number;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class EbookGroupListResponseDto {
  @ApiProperty({ type: [EbookGroupListItemDto] })
  groups!: EbookGroupListItemDto[];

  @ApiProperty({ type: 'integer', minimum: 0, example: 1 })
  total!: number;
}

export class EbookGroupDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Curse of Strahd' })
  name!: string;

  @ApiProperty({ nullable: true, type: String })
  sortName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'API cover URL' })
  coverUrl!: string | null;

  @ApiProperty({
    description:
      'True when this URL is the group cover. False when it is the first ebook cover.',
  })
  hasOwnCover!: boolean;

  @ApiProperty({ type: [EbookGroupMemberDto] })
  ebooks!: EbookGroupMemberDto[];
}

/** Group membership embedded on an ebook detail response. */
export class EbookDetailGroupDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Curse of Strahd' })
  name!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "This ebook's role in the group",
  })
  role!: string | null;

  @ApiProperty({
    type: [EbookGroupMemberDto],
    description: 'Other visible members, in group order',
  })
  members!: EbookGroupMemberDto[];
}

export class EbookGroupIdResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
}

export class EbookGroupSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class EbookGroupCoverResponseDto {
  @ApiProperty({
    example: '/api/ebooks/groups/550e8400-e29b-41d4-a716-446655440000/cover',
  })
  coverUrl!: string;
}

/** Default NestJS HTTP exception body, including validation error arrays. */
export class EbookGroupErrorResponseDto {
  @ApiProperty({ type: 'integer', example: 400 })
  statusCode!: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: ['name must be a string'],
  })
  message!: string | string[];

  @ApiPropertyOptional({ example: 'Bad Request' })
  error?: string;
}
