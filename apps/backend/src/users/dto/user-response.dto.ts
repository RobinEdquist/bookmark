import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserPermissionsResponseDto {
  @ApiProperty({ example: false })
  isAdmin!: boolean;

  @ApiProperty({ example: true })
  canEditMetadata!: boolean;

  @ApiProperty({ example: false })
  canUpload!: boolean;

  @ApiProperty({ example: false })
  canDelete!: boolean;

  @ApiProperty({ example: true })
  canGenerateApiKeys!: boolean;

  @ApiProperty({ example: true })
  canRequestContent!: boolean;
}

export class ApiKeyInfoDto {
  @ApiProperty({ example: true })
  hasKey!: boolean;

  @ApiPropertyOptional({ example: '2024-01-15T12:00:00.000Z', nullable: true })
  lastUsed?: string | null;

  @ApiPropertyOptional({ example: '192.168.1.1', nullable: true })
  lastIp?: string | null;
}

export class UserResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'John Doe' })
  name!: string;

  @ApiProperty({ example: 'john@example.com' })
  email!: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  image?: string | null;

  @ApiPropertyOptional({ example: 'user', nullable: true })
  role?: string | null;

  @ApiPropertyOptional({ example: false, nullable: true })
  banned?: boolean | null;

  @ApiPropertyOptional({ example: 'Violation of terms', nullable: true })
  banReason?: string | null;

  @ApiPropertyOptional({ example: '2024-02-15T12:00:00.000Z', nullable: true })
  banExpires?: string | null;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ type: UserPermissionsResponseDto })
  permissions!: UserPermissionsResponseDto;

  @ApiProperty({ type: [String], example: ['adult', 'explicit'] })
  blacklistedTags!: string[];

  @ApiPropertyOptional({ type: ApiKeyInfoDto, nullable: true })
  apiKey?: ApiKeyInfoDto | null;
}

export class UserListResponseDto {
  @ApiProperty({ type: [UserResponseDto] })
  users!: UserResponseDto[];

  @ApiProperty({ example: 25 })
  total!: number;
}

export class LanguageResponseDto {
  @ApiProperty({ example: 'en' })
  language!: string;
}

export class ThemeResponseDto {
  @ApiProperty({ example: '#f97316' })
  primaryColor!: string;

  @ApiProperty({ example: '#1c1917' })
  surfaceColor!: string;
}

// Keep the interfaces for backward compatibility with services
export interface UserPermissionsResponse {
  isAdmin: boolean;
  canEditMetadata: boolean;
  canUpload: boolean;
  canDelete: boolean;
  canGenerateApiKeys: boolean;
  canRequestContent: boolean;
}

export interface ApiKeyInfo {
  hasKey: boolean;
  lastUsed: string | null;
  lastIp: string | null;
}

export interface UserResponse {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: string | null;
  createdAt: string;
  permissions: UserPermissionsResponse;
  blacklistedTags: string[];
  apiKey: ApiKeyInfo | null;
}

export interface UserListResponse {
  users: UserResponse[];
  total: number;
}
