export interface UserPermissionsResponse {
  canEditMetadata: boolean;
  canUploadAudiobooks: boolean;
  canDeleteAudiobooks: boolean;
  canGenerateApiKeys: boolean;
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
