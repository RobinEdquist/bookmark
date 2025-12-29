import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderItemsDto {
  @ApiProperty({
    description: 'Array of list item IDs in the desired order',
    example: [
      '123e4567-e89b-12d3-a456-426614174000',
      '123e4567-e89b-12d3-a456-426614174001',
    ],
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  itemIds!: string[];
}
