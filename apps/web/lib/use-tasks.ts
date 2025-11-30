import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

export interface ImportStatus {
  pendingCount: number;
  pendingPaths: string[];
}

export interface HardcoverSyncStatus {
  pendingCount: number;
  failedCount: number;
}

export interface TasksStatus {
  import: ImportStatus;
  hardcoverSync: HardcoverSyncStatus;
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

const defaultImportStatus: ImportStatus = { pendingCount: 0, pendingPaths: [] };
const defaultHardcoverStatus: HardcoverSyncStatus = { pendingCount: 0, failedCount: 0 };

export function useTasksStatus() {
  const queryClient = useQueryClient();

  // Initial fetch gets combined status from HTTP
  const { data: initialData, isLoading } = useQuery({
    queryKey: queryKeys.tasks.status(),
    queryFn: fetchTasksStatus,
    staleTime: Infinity, // Data is pushed via WebSocket
  });

  // Get WebSocket-updated individual statuses if available
  const importStatus = queryClient.getQueryData<ImportStatus>(
    queryKeys.tasks.import()
  );
  const hardcoverStatus = queryClient.getQueryData<HardcoverSyncStatus>(
    queryKeys.tasks.hardcover()
  );

  // Merge: WebSocket updates override HTTP initial data
  const import_ = importStatus ?? initialData?.import ?? defaultImportStatus;
  const hardcover = hardcoverStatus ?? initialData?.hardcoverSync ?? defaultHardcoverStatus;

  const totalPending = import_.pendingCount + hardcover.pendingCount;

  return {
    import: import_,
    hardcoverSync: hardcover,
    totalPending,
    hasTasks: totalPending > 0 || hardcover.failedCount > 0,
    isLoading,
  };
}
