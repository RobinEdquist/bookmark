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
