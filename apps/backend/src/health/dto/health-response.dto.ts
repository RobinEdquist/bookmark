import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', description: 'Health status' })
  status!: string;

  @ApiProperty({
    example: '2024-01-15T12:00:00.000Z',
    description: 'Current server timestamp',
  })
  timestamp!: string;
}
