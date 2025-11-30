"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import type { ImportStatus, HardcoverSyncStatus } from "./use-tasks";

interface WSEvent {
  type: string;
  entityId?: string;
  timestamp: number;
  payload?: unknown;
}

type WSEventHandler = (event: WSEvent) => void;

interface UseWebSocketOptions {
  enabled?: boolean;
  onEvent?: WSEventHandler;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Hook to connect to the WebSocket server and handle cache invalidation
 *
 * @param options - Configuration options
 */
export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { enabled = true, onEvent, onConnect, onDisconnect } = options;
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const invalidateByEventType = useCallback(
    (event: WSEvent) => {
      const { type, entityId, payload } = event;

      switch (true) {
        // Audiobook events invalidate all audiobook queries
        case type.startsWith("audiobook."):
          queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
          // Also invalidate series since they contain audiobook data
          queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
          // Invalidate library stats since counts may have changed
          queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
          // If specific audiobook, also invalidate its hardcover link
          if (entityId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.hardcover.link(entityId),
            });
          }
          break;

        // Series events invalidate series queries
        case type.startsWith("series."):
          queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
          // Also invalidate audiobooks since they may reference series
          queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
          break;

        // Library scan events invalidate library stats and audiobooks
        case type.startsWith("library.scan."):
          queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
          break;

        // Hardcover sync events invalidate hardcover and audiobook queries
        case type.startsWith("hardcover."):
          queryClient.invalidateQueries({ queryKey: queryKeys.hardcover.all });
          // Invalidate audiobook lists since linked status/rating may have changed
          queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
          if (entityId) {
            // Invalidate the specific audiobook that was linked
            queryClient.invalidateQueries({
              queryKey: queryKeys.audiobooks.detail(entityId),
            });
          }
          break;

        // Settings events invalidate settings queries
        case type.startsWith("settings."):
          queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });
          break;

        // Import task status events - directly update cache
        case type === "tasks.import.status":
          if (payload) {
            queryClient.setQueryData(
              queryKeys.tasks.import(),
              payload as ImportStatus
            );
          }
          break;

        // Hardcover sync task status events - directly update cache
        case type === "tasks.hardcover.status":
          if (payload) {
            queryClient.setQueryData(
              queryKeys.tasks.hardcover(),
              payload as HardcoverSyncStatus
            );
          }
          break;

        default:
          console.log("[WS] Unhandled event type:", type);
      }
    },
    [queryClient]
  );

  const connect = useCallback(() => {
    // Don't connect if already connected, not enabled, or not in browser
    if (socketRef.current?.connected || !enabled || typeof window === "undefined") {
      return;
    }

    // Get the API URL from environment or default to same origin
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    const socket = io(apiUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      timeout: 20000,
    });

    socket.on("connect", () => {
      console.log("[WS] Connected to WebSocket server");
      setIsConnected(true);
      onConnect?.();
    });

    socket.on("disconnect", (reason) => {
      console.log("[WS] Disconnected:", reason);
      setIsConnected(false);
      onDisconnect?.();
    });

    socket.on("connect_error", (error) => {
      console.error("[WS] Connection error:", error.message);
      setIsConnected(false);
    });

    socket.on("event", (event: WSEvent) => {
      console.log("[WS] Received event:", event.type, event.entityId || "");
      onEvent?.(event);
      invalidateByEventType(event);
    });

    socketRef.current = socket;
  }, [enabled, onEvent, onConnect, onDisconnect, invalidateByEventType]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      console.log("[WS] Disconnected from WebSocket server");
    }
  }, []);

  const emit = useCallback((event: string, data: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected,
    socket: socketRef.current,
    disconnect,
    reconnect: () => {
      disconnect();
      setTimeout(connect, 100);
    },
    emit,
  };
}
