"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface BackupConfig {
  enabled: boolean;
  path: string;
  pathLocked: boolean;
  schedule: string;
  retention: number;
  timezone: string;
  nextBackupAt: string | null;
  isRunning: boolean;
}

export interface BackupEntry {
  id: string;
  filename: string;
  createdAt: string;
  size: number;
  appVersion: string;
}

export interface BackupOverview {
  config: BackupConfig;
  backups: BackupEntry[];
}

export interface UpdateBackupConfig {
  enabled?: boolean;
  path?: string | null;
  schedule?: string;
  retention?: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "Backup request failed");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function useBackups() {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: queryKeys.backups.overview(),
    queryFn: () => request<BackupOverview>("/api/admin/backups"),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.backups.all });

  const updateConfig = useMutation({
    mutationFn: (config: UpdateBackupConfig) =>
      request<BackupConfig>("/api/admin/backups/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      }),
    onSuccess: (config) => {
      queryClient.setQueryData<BackupOverview>(
        queryKeys.backups.overview(),
        (current) => (current ? { ...current, config } : current),
      );
      void invalidate();
    },
  });

  const createBackup = useMutation({
    mutationFn: () =>
      request<BackupEntry>("/api/admin/backups", { method: "POST" }),
    onSuccess: invalidate,
  });

  const uploadBackup = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return request<BackupEntry>("/api/admin/backups/upload", {
        method: "POST",
        body: formData,
      });
    },
    onSuccess: invalidate,
  });

  const deleteBackup = useMutation({
    mutationFn: (id: string) =>
      request<void>(`/api/admin/backups/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });

  const restoreBackup = useMutation({
    mutationFn: (id: string) =>
      request<{ restored: boolean; restartRequired: boolean }>(
        `/api/admin/backups/${encodeURIComponent(id)}/restore`,
        { method: "POST" },
      ),
  });

  return {
    overview,
    updateConfig,
    createBackup,
    uploadBackup,
    deleteBackup,
    restoreBackup,
  };
}
