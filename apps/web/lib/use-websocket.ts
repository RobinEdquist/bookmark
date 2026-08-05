"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { io, Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import type {
  ImportStatus,
  HardcoverSyncStatus,
  ScanStatus,
  TtsTaskStatus,
  GoodreadsLinkStatus,
} from "./use-tasks";
import type { RescanStatus } from "./use-rescan";

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
          // Lists depend on audiobook metadata and availability
          queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
          // Invalidate library stats since counts may have changed (but not availability - that only changes when library paths change)
          queryClient.invalidateQueries({
            queryKey: queryKeys.library.stats(),
          });
          // If specific audiobook, also invalidate its external links — a
          // background Goodreads link job reports itself as an update
          if (entityId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.hardcover.link("audiobook", entityId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.grFinder.link("audiobook", entityId),
            });
          }
          break;

        // Ebook events invalidate all ebook queries
        case type.startsWith("ebook."):
          queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
          // Lists depend on ebook metadata and availability
          queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
          // Invalidate library stats since counts may have changed (but not availability - that only changes when library paths change)
          queryClient.invalidateQueries({
            queryKey: queryKeys.library.stats(),
          });
          if (entityId) {
            queryClient.invalidateQueries({
              queryKey: queryKeys.grFinder.link("ebook", entityId),
            });
          }
          break;

        // Series events invalidate series queries
        case type.startsWith("series."):
          queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
          // Also invalidate audiobooks since they may reference series
          queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
          break;

        // Library scan events invalidate library stats, audiobooks, and ebooks
        case type.startsWith("library.scan."):
          queryClient.invalidateQueries({ queryKey: queryKeys.library.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.series.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
          break;

        // Hardcover sync events invalidate hardcover and audiobook queries
        case type.startsWith("hardcover."):
          queryClient.invalidateQueries({ queryKey: queryKeys.hardcover.all });
          // Invalidate audiobook lists since linked status/rating may have changed
          queryClient.invalidateQueries({ queryKey: queryKeys.audiobooks.all });
          // Invalidate ebook lists since linked status/rating may have changed
          queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.lists.all });
          if (entityId) {
            // Invalidate the specific media that was linked
            queryClient.invalidateQueries({
              queryKey: queryKeys.audiobooks.detail(entityId),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.ebooks.detail(entityId),
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
              payload as ImportStatus,
            );
          }
          break;

        // Hardcover sync task status events - directly update cache
        case type === "tasks.hardcover.status":
          if (payload) {
            queryClient.setQueryData(
              queryKeys.tasks.hardcover(),
              payload as HardcoverSyncStatus,
            );
          }
          break;

        // Library scan status events - directly update cache
        case type === "tasks.scan.status":
          if (payload) {
            queryClient.setQueryData(
              queryKeys.tasks.scan(),
              payload as ScanStatus,
            );
          }
          break;

        // TTS generation task status events - directly update cache
        case type === "tasks.tts.status":
          if (payload) {
            queryClient.setQueryData(
              queryKeys.tasks.tts(),
              payload as TtsTaskStatus,
            );
            queryClient.invalidateQueries({ queryKey: queryKeys.tts.jobs() });
            // Status events fire per chapter; only refetch ebook/audiobook
            // data when no job is active (one just finished or was
            // cancelled) - that's when Listen buttons and badges change.
            if ((payload as TtsTaskStatus).active === null) {
              queryClient.invalidateQueries({ queryKey: queryKeys.ebooks.all });
              queryClient.invalidateQueries({
                queryKey: queryKeys.audiobooks.all,
              });
            }
          }
          break;

        // Goodreads link queue status events - directly update cache
        case type === "tasks.goodreads.status":
          if (payload) {
            queryClient.setQueryData(
              queryKeys.tasks.goodreadsLink(),
              payload as GoodreadsLinkStatus,
            );
          }
          break;

        // Rescan status events - directly update cache
        case type === "tasks.rescan.status":
          if (payload) {
            queryClient.setQueryData(
              queryKeys.tasks.rescan(),
              payload as RescanStatus,
            );
          }
          break;

        default:
          console.log("[WS] Unhandled event type:", type);
      }
    },
    [queryClient],
  );

  const connect = useCallback(() => {
    // Don't connect if already connected, not enabled, or not in browser
    if (
      socketRef.current?.connected ||
      !enabled ||
      typeof window === "undefined"
    ) {
      return;
    }

    // Get the API URL from environment or default to same origin
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

    const socket = io(apiUrl, {
      path: "/api/socket.io",
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

  // `socket` is deliberately not returned. Exposing socketRef.current made the
  // hook's result depend on a ref read during render, so consumers latched the
  // value from whichever render they happened to run on — usually `null`, since
  // the socket is created in an effect — and never re-rendered when it changed.
  // Nothing read it; use `emit`/`isConnected`, which do track the connection.
  return {
    isConnected,
    disconnect,
    reconnect: () => {
      disconnect();
      setTimeout(connect, 100);
    },
    emit,
  };
}
