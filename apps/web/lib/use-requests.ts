"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

// Types
export type RequestStatus = 'pending' | 'approved' | 'downloading' | 'complete' | 'rejected';
export type ContentType = 'audiobook' | 'ebook';

export interface RequestResponse {
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

export interface MamSearchResult {
  id: string;
  title: string;
  author: string | null;
  narrator: string | null;
  series: string | null;
  description: string | null;
  coverUrl: string | null;
  contentType: ContentType;
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

export interface SearchMamResponse {
  results: MamSearchResult[];
  total: number;
}

export interface SearchFilters {
  contentType?: 'all' | 'audiobooks' | 'ebooks';
  searchIn?: string[];
  languages?: number[];
  perPage?: number;
}

// API functions
async function searchMam(query: string, filters?: SearchFilters): Promise<SearchMamResponse> {
  const response = await fetch("/api/requests/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      query,
      contentType: filters?.contentType,
      searchIn: filters?.searchIn,
      languages: filters?.languages,
      perPage: filters?.perPage,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Search failed");
  }

  return response.json();
}

async function fetchMyRequests(): Promise<RequestResponse[]> {
  const response = await fetch("/api/requests", {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch requests");
  }

  return response.json();
}

interface CreateRequestParams {
  mamTorrentId: string;
  title: string;
  author?: string;
  narrator?: string;
  series?: string;
  description?: string;
  coverUrl?: string;
  contentType: ContentType;
}

async function createRequest(params: CreateRequestParams): Promise<RequestResponse> {
  const response = await fetch("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to create request");
  }

  return response.json();
}

async function supportRequest(requestId: string): Promise<RequestResponse> {
  const response = await fetch(`/api/requests/${requestId}/support`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to support request");
  }

  return response.json();
}

// Admin API functions
async function fetchAdminRequests(status?: RequestStatus): Promise<RequestResponse[]> {
  const url = status
    ? `/api/admin/requests?status=${status}`
    : "/api/admin/requests";

  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to fetch requests");
  }

  return response.json();
}

async function approveRequest(requestId: string): Promise<RequestResponse> {
  const response = await fetch(`/api/admin/requests/${requestId}/approve`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to approve request");
  }

  return response.json();
}

async function rejectRequest(requestId: string, reason?: string): Promise<RequestResponse> {
  const response = await fetch(`/api/admin/requests/${requestId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ reason }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to reject request");
  }

  return response.json();
}

// Hooks
export function useSearchMam() {
  const mutation = useMutation({
    mutationFn: ({ query, filters }: { query: string; filters?: SearchFilters }) =>
      searchMam(query, filters),
  });

  return {
    search: (query: string, filters?: SearchFilters) =>
      mutation.mutateAsync({ query, filters }),
    isSearching: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

export function useMyRequests() {
  return useQuery({
    queryKey: queryKeys.requests.list(),
    queryFn: fetchMyRequests,
  });
}

export function useCreateRequest() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.all });
    },
  });

  return {
    createRequest: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}

export function useSupportRequest() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: supportRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.all });
    },
  });

  return {
    supportRequest: mutation.mutateAsync,
    isSupporting: mutation.isPending,
    error: mutation.error,
  };
}

// Admin hooks
export function useAdminRequests(status?: RequestStatus) {
  return useQuery({
    queryKey: queryKeys.adminRequests.list(status),
    queryFn: () => fetchAdminRequests(status),
  });
}

export function useApproveRequest() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: approveRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminRequests.all });
    },
  });

  return {
    approveRequest: mutation.mutateAsync,
    isApproving: mutation.isPending,
    error: mutation.error,
  };
}

export function useRejectRequest() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ requestId, reason }: { requestId: string; reason?: string }) =>
      rejectRequest(requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.adminRequests.all });
    },
  });

  return {
    rejectRequest: mutation.mutateAsync,
    isRejecting: mutation.isPending,
    error: mutation.error,
  };
}
