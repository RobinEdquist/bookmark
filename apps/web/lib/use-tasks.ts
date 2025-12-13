import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface MediaImportStatus {
  pendingCount: number;
  pendingNames: string[];
}

export interface ImportStatus {
  audiobooks: MediaImportStatus;
  ebooks: MediaImportStatus;
}

export interface HardcoverSyncStatus {
  pendingCount: number;
  failedCount: number;
}

export interface ScanStatus {
  isScanning: boolean;
  phase?: "reconciling" | "scanning" | "importing";
  total?: number;
  processed?: number;
  percentage?: number;
  currentFile?: string;
  libraryType?: "audiobook" | "ebook";
}

export interface TasksStatus {
  import: ImportStatus;
  hardcoverSync: HardcoverSyncStatus;
  scan: ScanStatus;
}

async function fetchTasksStatus(): Promise<TasksStatus> {
  const response = await fetch("/api/tasks/status", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch tasks status");
  }

  return response.json();
}

const defaultMediaImportStatus: MediaImportStatus = { pendingCount: 0, pendingNames: [] };
const defaultImportStatus: ImportStatus = {
  audiobooks: defaultMediaImportStatus,
  ebooks: defaultMediaImportStatus,
};
const defaultHardcoverStatus: HardcoverSyncStatus = { pendingCount: 0, failedCount: 0 };
const defaultScanStatus: ScanStatus = { isScanning: false };

export function useTasksStatus() {
  // Initial fetch gets combined status from HTTP
  const { data: initialData, isLoading } = useQuery({
    queryKey: queryKeys.tasks.status(),
    queryFn: fetchTasksStatus,
    staleTime: Infinity, // Data is pushed via WebSocket
  });

  // Use useQuery for WebSocket-updated statuses so component re-renders
  // queryFn is required but never called since enabled: false
  const { data: importStatus } = useQuery<ImportStatus>({
    queryKey: queryKeys.tasks.import(),
    queryFn: () => Promise.resolve(defaultImportStatus),
    enabled: false, // Only populated via WebSocket setQueryData
    staleTime: Infinity,
  });

  const { data: hardcoverStatus } = useQuery<HardcoverSyncStatus>({
    queryKey: queryKeys.tasks.hardcover(),
    queryFn: () => Promise.resolve(defaultHardcoverStatus),
    enabled: false, // Only populated via WebSocket setQueryData
    staleTime: Infinity,
  });

  const { data: scanStatus } = useQuery<ScanStatus>({
    queryKey: queryKeys.tasks.scan(),
    queryFn: () => Promise.resolve(defaultScanStatus),
    enabled: false, // Only populated via WebSocket setQueryData
    staleTime: Infinity,
  });

  // Merge: WebSocket updates override HTTP initial data
  const import_ = importStatus ?? initialData?.import ?? defaultImportStatus;
  const hardcover = hardcoverStatus ?? initialData?.hardcoverSync ?? defaultHardcoverStatus;
  const scan = scanStatus ?? initialData?.scan ?? defaultScanStatus;

  const importPendingCount = import_.audiobooks.pendingCount + import_.ebooks.pendingCount;
  const totalPending = importPendingCount + hardcover.pendingCount + (scan.isScanning ? 1 : 0);

  return {
    import: import_,
    hardcoverSync: hardcover,
    scan,
    totalPending,
    hasTasks: totalPending > 0 || hardcover.failedCount > 0,
    isLoading,
  };
}
