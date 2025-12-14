// MAM Search Types
export interface MamSearchParams {
  text: string;
  searchType?: 'all' | 'active' | 'fl' | 'VIP';
  main_cat?: number[]; // 13=Audiobooks, 14=Ebooks
  perpage?: number;
  startNumber?: number;
}

export interface MamTorrent {
  id: string;
  title: string;
  author_info: string;
  narrator_info: string;
  series_info: string;
  category: number;
  catname: string;
  main_cat: number;
  size: string;
  added: string;
  free: boolean;
  vip: boolean;
  tags: string;
  filetype: string;
  language: number;
  lang_code: string;
  description?: string;
}

export interface MamSearchResponse {
  data: MamTorrent[];
  total: number;
  total_found: number;
}

// MAM Download Types
export interface MamDownloadResponse {
  status: string;
  message: string;
  hash: string;
}

// Torrent Status Types
export interface TorrentFile {
  name: string;
  size: number;
}

export interface TorrentStatus {
  hash: string;
  name: string;
  state: 'downloading' | 'seeding' | 'completed' | 'paused' | 'error' | 'not_found';
  progress: number;
  size?: number;
  downloaded?: number;
  files?: TorrentFile[];
}

export interface BulkTorrentStatus {
  torrents: TorrentStatus[];
}
