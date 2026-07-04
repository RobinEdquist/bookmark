"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

// ---------------------------------------------------------------------------
// Types — mirror the backend TTS contract (see apps/backend tts module).
// Dates are typed as string because JSON serialises Date to ISO strings.
// ---------------------------------------------------------------------------

export interface TtsStatus {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
  apiKeySet: boolean;
  voice: string;
  speed: number;
  model: string;
}

export interface TtsConfigInput {
  enabled?: boolean;
  baseUrl?: string | null;
  apiKey?: string | null;
  voice?: string;
  speed?: number;
  model?: string;
}

export interface TtsValidateInput {
  baseUrl: string;
  apiKey?: string;
  voice?: string;
  model?: string;
}

export interface TtsValidateResult {
  ok: boolean;
  /** null when the server can't list voices → fall back to free-text input. */
  voices: string[] | null;
  error?: string;
}

export type TtsJobStatus =
  | "pending"
  | "extracting"
  | "generating"
  | "assembling"
  | "importing"
  | "completed"
  | "failed"
  | "cancelled";

export interface TtsJob {
  id: string;
  ebookId: string;
  ebookTitle: string;
  audiobookId: string | null;
  status: TtsJobStatus;
  voice: string;
  totalChapters: number | null;
  completedChapters: number;
  currentChapterTitle: string | null;
  errorMessage: string | null;
  warningMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

async function fetchTtsStatus(): Promise<TtsStatus> {
  const response = await fetch("/api/tts/status", { credentials: "include" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch TTS status");
  }
  return response.json();
}

async function saveTtsConfig(input: TtsConfigInput): Promise<TtsStatus> {
  const response = await fetch("/api/tts/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save TTS settings");
  }
  return response.json();
}

async function validateTts(
  input: TtsValidateInput,
): Promise<TtsValidateResult> {
  const response = await fetch("/api/tts/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to test TTS connection");
  }
  return response.json();
}

async function fetchTtsVoices(): Promise<{ voices: string[] | null }> {
  const response = await fetch("/api/tts/voices", { credentials: "include" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch TTS voices");
  }
  return response.json();
}

async function fetchTtsJobs(): Promise<TtsJob[]> {
  const response = await fetch("/api/tts/jobs", { credentials: "include" });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch TTS jobs");
  }
  return response.json();
}

async function createTtsJob(ebookId: string, voice?: string): Promise<TtsJob> {
  const response = await fetch("/api/tts/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(voice ? { ebookId, voice } : { ebookId }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to start audiobook generation");
  }
  return response.json();
}

async function cancelTtsJob(id: string): Promise<TtsJob> {
  const response = await fetch(`/api/tts/jobs/${id}/cancel`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to cancel TTS job");
  }
  return response.json();
}

async function retryTtsJob(id: string): Promise<TtsJob> {
  const response = await fetch(`/api/tts/jobs/${id}/retry`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to retry TTS job");
  }
  return response.json();
}

async function dismissTtsJob(id: string): Promise<void> {
  const response = await fetch(`/api/tts/jobs/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "Failed to dismiss TTS job");
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * TTS status hits an admin-only endpoint. Callers MUST pass `enabled` gated on
 * the current user being an admin so non-admins never trigger the request.
 */
export function useTtsStatus(enabled = true) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.tts.status(),
    queryFn: fetchTtsStatus,
    enabled,
  });

  return {
    status: data ?? null,
    isEnabled: data?.enabled ?? false,
    isConfigured: data?.configured ?? false,
    isLoading,
    error,
    refetch,
  };
}

export function useUpdateTtsConfig() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: saveTtsConfig,
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.tts.status(), status);
      queryClient.invalidateQueries({ queryKey: queryKeys.tts.voices() });
    },
  });

  return {
    updateConfig: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error,
  };
}

export function useTtsValidate() {
  const mutation = useMutation({
    mutationFn: validateTts,
  });

  return {
    validate: mutation.mutateAsync,
    isValidating: mutation.isPending,
    result: mutation.data ?? null,
    error: mutation.error,
    reset: mutation.reset,
  };
}

export function useTtsVoices(enabled = true) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.tts.voices(),
    queryFn: fetchTtsVoices,
    enabled,
  });

  return {
    voices: data?.voices ?? null,
    isLoading,
    error,
  };
}

export function useTtsJobs(enabled = true) {
  return useQuery({
    queryKey: queryKeys.tts.jobs(),
    queryFn: fetchTtsJobs,
    enabled,
  });
}

export function useGenerateAudiobook() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ ebookId, voice }: { ebookId: string; voice?: string }) =>
      createTtsJob(ebookId, voice),
    onSuccess: (_job, { ebookId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.ebooks.detail(ebookId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.tts.jobs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.status() });
    },
  });

  return {
    generate: mutation.mutateAsync,
    isGenerating: mutation.isPending,
    error: mutation.error,
  };
}

export function useCancelTtsJob() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: cancelTtsJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tts.jobs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.status() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
    },
  });

  return {
    cancelJob: mutation.mutateAsync,
    isCancelling: mutation.isPending,
    error: mutation.error,
  };
}

export function useRetryTtsJob() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: retryTtsJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tts.jobs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.status() });
    },
  });

  return {
    retryJob: mutation.mutateAsync,
    isRetrying: mutation.isPending,
    error: mutation.error,
  };
}

export function useDismissTtsJob() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: dismissTtsJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tts.jobs() });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.status() });
    },
  });

  return {
    dismissJob: mutation.mutateAsync,
    isDismissing: mutation.isPending,
    error: mutation.error,
  };
}
