import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiKeyResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiPropertyOptional({ example: 'My API Key', nullable: true })
  name?: string | null;

  @ApiPropertyOptional({
    example: 'bkmrk_abc',
    description: 'First few characters of the key',
    nullable: true,
  })
  start?: string | null;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;

  @ApiPropertyOptional({ example: '2024-01-20T08:00:00.000Z', nullable: true })
  lastRequest?: Date | null;

  @ApiPropertyOptional({ example: '192.168.1.1', nullable: true })
  lastIp?: string | null;
}

export class ApiKeyCreateResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiPropertyOptional({ example: 'My API Key', nullable: true })
  name?: string | null;

  @ApiProperty({
    example: 'bkmrk_abc123def456',
    description: 'Full API key - only shown once',
  })
  key!: string;

  @ApiPropertyOptional({ example: 'bkmrk_abc', nullable: true })
  start?: string | null;

  @ApiProperty({ example: '2024-01-15T12:00:00.000Z' })
  createdAt!: Date;
}

export class RevokeApiKeyResponseDto {
  @ApiProperty({ example: true })
  revoked!: boolean;
}

// Keep the interfaces for backward compatibility with services
export interface ApiKeyResponse {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: Date;
  lastRequest: Date | null;
  lastIp: string | null;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string | null;
  key: string;
  start: string | null;
  createdAt: Date;
}
