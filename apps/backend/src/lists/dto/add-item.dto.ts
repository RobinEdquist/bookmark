import { IsIn, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddItemDto {
  @ApiProperty({
    description: 'Type of item being added',
    example: 'audiobook',
    enum: ['audiobook', 'ebook', 'comic_series'],
  })
  @IsIn(['audiobook', 'ebook', 'comic_series'])
  itemType!: 'audiobook' | 'ebook' | 'comic_series';

  @ApiProperty({
    description: 'ID of the audiobook, ebook, or comic series to add',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  itemId!: string;
}
