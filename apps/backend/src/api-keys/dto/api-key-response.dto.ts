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
