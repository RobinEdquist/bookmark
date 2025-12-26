import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ example: 'NOT_FOUND', description: 'Error code' })
  code!: string;

  @ApiProperty({
    example: 'Resource not found',
    description: 'Human-readable error message',
  })
  message!: string;

  @ApiProperty({
    example: '2024-01-15T12:00:00.000Z',
    description: 'ISO timestamp of when the error occurred',
  })
  timestamp!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ErrorDetailDto })
  error!: ErrorDetailDto;
}

export class UnauthorizedResponseDto extends ErrorResponseDto {
  @ApiProperty({
    type: ErrorDetailDto,
    example: {
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
      timestamp: '2024-01-15T12:00:00.000Z',
    },
  })
  declare error: ErrorDetailDto;
}

export class ForbiddenResponseDto extends ErrorResponseDto {
  @ApiProperty({
    type: ErrorDetailDto,
    example: {
      code: 'FORBIDDEN',
      message: 'Forbidden',
      timestamp: '2024-01-15T12:00:00.000Z',
    },
  })
  declare error: ErrorDetailDto;
}

export class NotFoundResponseDto extends ErrorResponseDto {
  @ApiProperty({
    type: ErrorDetailDto,
    example: {
      code: 'NOT_FOUND',
      message: 'Resource not found',
      timestamp: '2024-01-15T12:00:00.000Z',
    },
  })
  declare error: ErrorDetailDto;
}

export class BadRequestResponseDto extends ErrorResponseDto {
  @ApiProperty({
    type: ErrorDetailDto,
    example: {
      code: 'BAD_REQUEST',
      message: 'Validation error',
      timestamp: '2024-01-15T12:00:00.000Z',
    },
  })
  declare error: ErrorDetailDto;
}
