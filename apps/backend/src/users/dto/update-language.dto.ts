import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLanguageDto {
  @ApiProperty({
    description: 'User interface language',
    example: 'en',
    enum: ['en', 'sv'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['en', 'sv'], { message: 'Language must be either "en" or "sv"' })
  language!: string;
}
