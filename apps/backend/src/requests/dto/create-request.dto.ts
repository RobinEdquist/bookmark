import { IsString, IsOptional, IsIn, IsInt } from 'class-validator';

export class CreateRequestDto {
  @IsInt()
  mamTorrentId!: number;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  narrator?: string;

  @IsOptional()
  @IsString()
  series?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverUrl?: string;

  @IsIn(['audiobook', 'ebook'])
  contentType!: 'audiobook' | 'ebook';

  @IsInt()
  mamCategory!: number;
}
