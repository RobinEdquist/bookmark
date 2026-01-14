import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface Announcement {
  id: string;
  title: string;
  message: string;
  createdAt: string;
}

export interface AdminAnnouncement extends Announcement {
  isActive: boolean;
  createdBy: string;
  updatedAt: string;
}

export interface CreateAnnouncementParams {
  title: string;
  message: string;
  isActive?: boolean;
}

export interface UpdateAnnouncementParams {
  id: string;
  title?: string;
  message?: string;
  isActive?: boolean;
}

// User hooks

async function fetchActiveAnnouncements(): Promise<Announcement[]> {
  const response = await fetch("/api/announcements/active", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch announcements");
  }
  return response.json();
}

async function dismissAnnouncement(id: string): Promise<{ success: boolean }> {
  const response = await fetch(`/api/announcements/${id}/dismiss`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to dismiss announcement");
  }
  return response.json();
}

export function useActiveAnnouncements() {
  return useQuery({
    queryKey: queryKeys.announcements.active(),
    queryFn: fetchActiveAnnouncements,
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useDismissAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: dismissAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.announcements.active(),
      });
    },
  });
}

// Admin hooks

async function fetchAdminAnnouncements(): Promise<AdminAnnouncement[]> {
  const response = await fetch("/api/admin/announcements", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch announcements");
  }
  return response.json();
}

async function createAnnouncement(
  params: CreateAnnouncementParams
): Promise<AdminAnnouncement> {
  const response = await fetch("/api/admin/announcements", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error("Failed to create announcement");
  }
  return response.json();
}

async function updateAnnouncement(
  params: UpdateAnnouncementParams
): Promise<AdminAnnouncement> {
  const { id, ...data } = params;
  const response = await fetch(`/api/admin/announcements/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to update announcement");
  }
  return response.json();
}

async function deleteAnnouncement(id: string): Promise<void> {
  const response = await fetch(`/api/admin/announcements/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to delete announcement");
  }
}

export function useAdminAnnouncements() {
  return useQuery({
    queryKey: queryKeys.announcements.admin(),
    queryFn: fetchAdminAnnouncements,
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.announcements.all,
      });
    },
  });
}

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.announcements.all,
      });
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.announcements.all,
      });
    },
  });
}
