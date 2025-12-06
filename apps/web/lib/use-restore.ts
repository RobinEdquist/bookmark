"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { queryKeys } from "./query-keys";
import type {
  RestoreSession,
  PathMapping,
  UserMapping,
  RestoreOptions,
  ImportPreview,
  RestoreProgress,
  UploadBackupResponse,
  SavUser,
  ApiSuccessResponse,
} from "./types/restore";

// API client functions

async function uploadBackupApi(file: File): Promise<UploadBackupResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/admin/restore/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to upload backup");
  }

  return response.json();
}

async function fetchRestoreSession(sessionId: string): Promise<RestoreSession> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch restore session");
  }

  return response.json();
}

async function selectLibraryApi(
  sessionId: string,
  libraryId: string,
): Promise<ApiSuccessResponse> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}/library`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ libraryId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to select library");
  }

  return response.json();
}

async function setPathMappingsApi(
  sessionId: string,
  pathMappings: PathMapping[],
): Promise<ApiSuccessResponse> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}/path-mappings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ pathMappings }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to set path mappings");
  }

  return response.json();
}

async function setUserMappingsApi(
  sessionId: string,
  userMappings: UserMapping[],
): Promise<ApiSuccessResponse> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}/user-mappings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ userMappings }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to set user mappings");
  }

  return response.json();
}

async function setRestoreOptionsApi(
  sessionId: string,
  options: Partial<RestoreOptions>,
): Promise<ApiSuccessResponse> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}/options`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to set restore options");
  }

  return response.json();
}

async function fetchPreview(sessionId: string): Promise<ImportPreview> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}/preview`, {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to generate preview");
  }

  return response.json();
}

async function executeImportApi(sessionId: string): Promise<ApiSuccessResponse> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}/execute`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to start import");
  }

  return response.json();
}

async function cancelRestoreApi(sessionId: string): Promise<void> {
  const response = await fetch(`/api/admin/restore/sessions/${sessionId}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to cancel restore");
  }
}

async function fetchSavUsers(): Promise<SavUser[]> {
  const response = await fetch("/api/admin/restore/sav-users", {
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "Failed to fetch SAV users");
  }

  return response.json();
}

// React Query hooks

/**
 * Upload an AudioBookShelf backup file
 */
export function useUploadBackup() {
  return useMutation({
    mutationFn: uploadBackupApi,
  });
}

/**
 * Get the current status of a restore session
 */
export function useRestoreSession(sessionId: string | null) {
  return useQuery({
    queryKey: sessionId ? queryKeys.restore.session(sessionId) : [],
    queryFn: () => fetchRestoreSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      // Poll while in active states
      if (state === "uploading" || state === "parsing" || state === "importing") {
        return 2000; // Poll every 2 seconds
      }
      return false; // Don't poll in other states
    },
  });
}

/**
 * Select which library to restore from the backup
 */
export function useSelectLibrary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sessionId, libraryId }: { sessionId: string; libraryId: string }) =>
      selectLibraryApi(sessionId, libraryId),
    onSuccess: (_, variables) => {
      // Invalidate session to refetch updated state
      queryClient.invalidateQueries({
        queryKey: queryKeys.restore.session(variables.sessionId),
      });
    },
  });
}

/**
 * Set path mappings for the restore
 */
export function useSetPathMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      pathMappings,
    }: {
      sessionId: string;
      pathMappings: PathMapping[];
    }) => setPathMappingsApi(sessionId, pathMappings),
    onSuccess: (_, variables) => {
      // Invalidate session to refetch updated state
      queryClient.invalidateQueries({
        queryKey: queryKeys.restore.session(variables.sessionId),
      });
    },
  });
}

/**
 * Set user mappings for the restore
 */
export function useSetUserMappings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      userMappings,
    }: {
      sessionId: string;
      userMappings: UserMapping[];
    }) => setUserMappingsApi(sessionId, userMappings),
    onSuccess: (_, variables) => {
      // Invalidate session to refetch updated state
      queryClient.invalidateQueries({
        queryKey: queryKeys.restore.session(variables.sessionId),
      });
    },
  });
}

/**
 * Set restore options
 */
export function useSetRestoreOptions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      sessionId,
      options,
    }: {
      sessionId: string;
      options: Partial<RestoreOptions>;
    }) => setRestoreOptionsApi(sessionId, options),
    onSuccess: (_, variables) => {
      // Invalidate session to refetch updated state
      queryClient.invalidateQueries({
        queryKey: queryKeys.restore.session(variables.sessionId),
      });
    },
  });
}

/**
 * Generate a preview of what will be imported
 * This is a query with manual triggering via enabled flag
 */
export function useGeneratePreview(sessionId: string | null, enabled: boolean = false) {
  return useQuery({
    queryKey: sessionId ? queryKeys.restore.preview(sessionId) : [],
    queryFn: () => fetchPreview(sessionId!),
    enabled: !!sessionId && enabled,
    staleTime: 60000, // Cache for 1 minute
  });
}

/**
 * Start the import process
 */
export function useExecuteImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (sessionId: string) => executeImportApi(sessionId),
    onSuccess: (_, sessionId) => {
      // Invalidate session to refetch updated state
      queryClient.invalidateQueries({
        queryKey: queryKeys.restore.session(sessionId),
      });
    },
  });
}

/**
 * Cancel a restore session
 */
export function useCancelRestore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelRestoreApi,
    onSuccess: (_, sessionId) => {
      // Remove session from cache
      queryClient.removeQueries({
        queryKey: queryKeys.restore.session(sessionId),
      });
      queryClient.removeQueries({
        queryKey: queryKeys.restore.preview(sessionId),
      });
    },
  });
}

/**
 * Get list of SAV users for mapping
 */
export function useSavUsers() {
  return useQuery({
    queryKey: queryKeys.restore.savUsers(),
    queryFn: fetchSavUsers,
    staleTime: 300000, // Cache for 5 minutes
  });
}

/**
 * WebSocket hook for real-time restore progress updates
 */
export function useRestoreProgress(sessionId: string | null) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    // Don't connect if no session or already connected
    if (!sessionId || socketRef.current?.connected || typeof window === "undefined") {
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    const socket = io(apiUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    socket.on("connect", () => {
      console.log(`[Restore WS] Connected for session ${sessionId}`);
      setIsConnected(true);
      // Join the session-specific room
      socket.emit("restore:join", sessionId);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Restore WS] Disconnected:`, reason);
      setIsConnected(false);
    });

    socket.on("connect_error", (error) => {
      console.error(`[Restore WS] Connection error:`, error.message);
      setIsConnected(false);
    });

    // Listen for restore progress events
    socket.on("restore:progress", (data: RestoreProgress) => {
      console.log(`[Restore WS] Progress update:`, data.percentage, "%");
      setProgress(data);
    });

    // Listen for restore completion
    socket.on("restore:complete", (data: { sessionId: string; success: boolean }) => {
      console.log(`[Restore WS] Restore complete:`, data.success);
      // Invalidate session to get final state
      queryClient.invalidateQueries({
        queryKey: queryKeys.restore.session(data.sessionId),
      });
      // Invalidate all data that might have been imported
      queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.progress.all });
    });

    // Listen for restore errors
    socket.on("restore:error", (data: { sessionId: string; error: string }) => {
      console.error(`[Restore WS] Restore error:`, data.error);
      // Invalidate session to get updated error state
      queryClient.invalidateQueries({
        queryKey: queryKeys.restore.session(data.sessionId),
      });
    });

    socketRef.current = socket;
  }, [sessionId, queryClient]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      console.log("[Restore WS] Disconnected");
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [sessionId, connect, disconnect]);

  return {
    progress,
    isConnected,
    disconnect,
  };
}
