import { RequestStatus, ContentType } from '../schema';

export interface RequestResponseDto {
  id: string;
  userId: string;
  userEmail: string;
  status: RequestStatus;
  mamTorrentId: string;
  title: string;
  author: string | null;
  narrator: string | null;
  series: string | null;
  description: string | null;
  coverUrl: string | null;
  contentType: ContentType;
  rejectionReason: string | null;
  libraryItemId: string | null;
  libraryItemType: ContentType | null;
  supporterCount: number;
  isSupporter: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MamSearchResultDto {
  id: string;
  title: string;
  author: string | null;
  narrator: string | null;
  series: string | null;
  description: string | null;
  coverUrl: string | null;
  contentType: 'audiobook' | 'ebook';
  size: string;
  language: string;
  fileType: string;
  tags: string;
  addedDate: string;
  existingRequestId: string | null;
  existingRequestStatus: RequestStatus | null;
  inLibrary: boolean;
  libraryItemId: string | null;
}

export interface SearchMamResponseDto {
  results: MamSearchResultDto[];
  total: number;
}
