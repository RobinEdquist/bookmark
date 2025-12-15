"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient, QueryKey } from "@tanstack/react-query";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface CoverUploadConfig {
  /** The API endpoint path (e.g., "audiobooks" or "ebooks") */
  apiPath: string;
  /** Query keys to invalidate on success */
  queryKeys: {
    all: QueryKey;
    detail: (id: string) => QueryKey;
  };
}

export interface CoverUploadState {
  activeTab: "upload" | "url";
  selectedFile: File | null;
  previewUrl: string | null;
  urlInput: string;
  urlPreview: string | null;
  isLoadingPreview: boolean;
  urlError: string | null;
}

export interface CoverUploadActions {
  setActiveTab: (tab: "upload" | "url") => void;
  handleFileSelect: (file: File | null) => { success: boolean; error?: string };
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => { success: boolean; error?: string };
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleUrlChange: (url: string) => void;
  handlePreviewUrl: () => { success: boolean; error?: string };
  resetState: () => void;
  canSubmit: boolean;
}

export interface UseCoverUploadReturn {
  state: CoverUploadState;
  actions: CoverUploadActions;
  mutation: {
    mutateAsync: (params: { entityId: string }) => Promise<{ coverUrl: string }>;
    isPending: boolean;
  };
}

async function updateCover(
  apiPath: string,
  entityId: string,
  file: File | null,
  url: string | null
): Promise<{ coverUrl: string }> {
  const formData = new FormData();

  if (file) {
    formData.append("file", file);
  } else if (url) {
    formData.append("url", url);
  }

  const response = await fetch(`/api/${apiPath}/${entityId}/cover`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || "Failed to update cover");
  }

  return response.json();
}

/**
 * Shared hook for cover image upload functionality.
 * Used by both audiobook and ebook cover dialogs.
 */
export function useCoverUpload(config: CoverUploadConfig): UseCoverUploadReturn {
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlPreview, setUrlPreview] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  // Mutation
  const mutation = useMutation({
    mutationFn: async ({ entityId }: { entityId: string }) => {
      const file = activeTab === "upload" ? selectedFile : null;
      const url = activeTab === "url" ? urlInput.trim() : null;
      return updateCover(config.apiPath, entityId, file, url);
    },
    onSuccess: (_, { entityId }) => {
      queryClient.invalidateQueries({ queryKey: config.queryKeys.all });
      queryClient.invalidateQueries({ queryKey: config.queryKeys.detail(entityId) });
    },
  });

  // Reset state
  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUrlInput("");
    setUrlPreview(null);
    setUrlError(null);
    setActiveTab("upload");
  }, []);

  // Validate and process file
  const processFile = useCallback((file: File): { success: boolean; error?: string } => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { success: false, error: "invalidType" };
    }

    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: "tooLarge" };
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    return { success: true };
  }, []);

  // Handle file input change
  const handleFileSelect = useCallback(
    (file: File | null): { success: boolean; error?: string } => {
      if (!file) return { success: false };
      return processFile(file);
    },
    [processFile]
  );

  // Handle drag and drop
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>): { success: boolean; error?: string } => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file) return { success: false };
      return processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  // Handle URL input change
  const handleUrlChange = useCallback((url: string) => {
    setUrlInput(url);
    setUrlPreview(null);
    setUrlError(null);
  }, []);

  // Preview URL
  const handlePreviewUrl = useCallback((): { success: boolean; error?: string } => {
    if (!urlInput.trim()) return { success: false };

    setIsLoadingPreview(true);
    setUrlError(null);

    try {
      new URL(urlInput);
      setUrlPreview(urlInput);
      setIsLoadingPreview(false);
      return { success: true };
    } catch {
      setIsLoadingPreview(false);
      setUrlError("invalidUrl");
      return { success: false, error: "invalidUrl" };
    }
  }, [urlInput]);

  // Can submit check
  const canSubmit =
    !mutation.isPending &&
    ((activeTab === "upload" && selectedFile !== null) ||
      (activeTab === "url" && urlInput.trim() !== ""));

  return {
    state: {
      activeTab,
      selectedFile,
      previewUrl,
      urlInput,
      urlPreview,
      isLoadingPreview,
      urlError,
    },
    actions: {
      setActiveTab,
      handleFileSelect,
      handleDrop,
      handleDragOver,
      handleUrlChange,
      handlePreviewUrl,
      resetState,
      canSubmit,
    },
    mutation: {
      mutateAsync: mutation.mutateAsync,
      isPending: mutation.isPending,
    },
  };
}

// Pre-configured hooks for audiobooks and ebooks
export { MAX_FILE_SIZE, ALLOWED_TYPES };
