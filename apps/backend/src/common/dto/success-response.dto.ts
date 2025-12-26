import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Operation completed successfully' })
  message!: string;
}

export class CountResponseDto {
  @ApiProperty({ example: 10, description: 'Number of items affected' })
  count!: number;
}
