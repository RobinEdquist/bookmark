import { ApiProperty } from '@nestjs/swagger';

export class AdminGenreDto {
  @ApiProperty({ description: 'Genre ID' })
  id!: string;

  @ApiProperty({ description: 'Genre name' })
  name!: string;

  @ApiProperty({ description: 'Number of audiobooks with this genre' })
  audiobookCount!: number;

  @ApiProperty({ description: 'Number of ebooks with this genre' })
  ebookCount!: number;

  @ApiProperty({ description: 'Number of comic series with this genre' })
  comicCount!: number;
}

export class AdminGenresResponseDto {
  @ApiProperty({ type: [AdminGenreDto] })
  genres!: AdminGenreDto[];
}

export class RenameConflictDto {
  @ApiProperty({ description: 'Indicates a name conflict exists' })
  conflict!: true;

  @ApiProperty({ description: 'The existing genre with the target name' })
  existingGenre!: { id: string; name: string };

  @ApiProperty({ description: 'The source genre being renamed' })
  sourceGenre!: { id: string; name: string };

  @ApiProperty({ description: 'Number of audiobooks that would be merged' })
  audiobookCount!: number;

  @ApiProperty({ description: 'Number of ebooks that would be merged' })
  ebookCount!: number;

  @ApiProperty({ description: 'Number of comic series that would be merged' })
  comicCount!: number;
}

export class MergeResultDto {
  @ApiProperty({ description: 'Target genre ID' })
  id!: string;

  @ApiProperty({ description: 'Target genre name' })
  name!: string;

  @ApiProperty({ description: 'Number of audiobooks merged' })
  audiobooksMerged!: number;

  @ApiProperty({ description: 'Number of ebooks merged' })
  ebooksMerged!: number;

  @ApiProperty({ description: 'Number of comic series merged' })
  comicsMerged!: number;
}
