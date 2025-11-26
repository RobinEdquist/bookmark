import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateLanguageDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['en', 'sv'], { message: 'Language must be either "en" or "sv"' })
  language!: string;
}
