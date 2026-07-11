import { ApiProperty } from '@nestjs/swagger';

export class AdminPersonDto {
  @ApiProperty({ description: 'Person ID' })
  id!: string;

  @ApiProperty({ description: 'Person name' })
  name!: string;

  @ApiProperty({
    description: 'Number of audiobook author links',
    example: 12,
  })
  audiobookAuthorCount!: number;

  @ApiProperty({
    description: 'Number of ebook author links',
    example: 4,
  })
  ebookAuthorCount!: number;

  @ApiProperty({
    description: 'Number of audiobook narrator links',
    example: 8,
  })
  audiobookNarratorCount!: number;
}

export class AdminPeopleResponseDto {
  @ApiProperty({ type: [AdminPersonDto] })
  people!: AdminPersonDto[];
}

export class RenamePersonConflictDto {
  @ApiProperty({ description: 'Indicates a name conflict exists' })
  conflict!: true;

  @ApiProperty({ description: 'The existing person with the target name' })
  existingPerson!: { id: string; name: string };

  @ApiProperty({ description: 'The source person being renamed' })
  sourcePerson!: { id: string; name: string };

  @ApiProperty({ description: 'Number of audiobook author links' })
  audiobookAuthorCount!: number;

  @ApiProperty({ description: 'Number of ebook author links' })
  ebookAuthorCount!: number;

  @ApiProperty({ description: 'Number of audiobook narrator links' })
  audiobookNarratorCount!: number;
}

export class MergePersonResultDto {
  @ApiProperty({ description: 'Target person ID' })
  id!: string;

  @ApiProperty({ description: 'Target person name' })
  name!: string;

  @ApiProperty({ description: 'Number of audiobook author links merged' })
  audiobookAuthorLinksMerged!: number;

  @ApiProperty({ description: 'Number of ebook author links merged' })
  ebookAuthorLinksMerged!: number;

  @ApiProperty({ description: 'Number of audiobook narrator links merged' })
  audiobookNarratorLinksMerged!: number;
}

export class SplitPersonResultDto {
  @ApiProperty({ description: 'Source person ID' })
  id!: string;

  @ApiProperty({ description: 'Replacement person names' })
  names!: string[];

  @ApiProperty({ description: 'Number of audiobook author links split' })
  audiobookAuthorLinksSplit!: number;

  @ApiProperty({ description: 'Number of ebook author links split' })
  ebookAuthorLinksSplit!: number;

  @ApiProperty({ description: 'Number of audiobook narrator links split' })
  audiobookNarratorLinksSplit!: number;
}
