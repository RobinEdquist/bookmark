import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  mamTorrentId!: string;

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
}
