"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

interface SSEEvent {
  type: string;
  entityId?: string;
  timestamp: number;
}

type SSEEventHandler = (event: SSEEvent) => void;

/**
 * Hook to connect to the SSE events endpoint and handle cache invalidation
 *
 * @param enabled - Whether SSE connection should be active (typically based on auth state)
 * @param onEvent - Optional callback to handle raw events
 */
export function useSSE(enabled: boolean = true, onEvent?: SSEEventHandler) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidateByEventType = useCallback(
    (event: SSEEvent) => {
      const { type, entityId } = event;

      // Broad invalidation strategy: invalidate all queries in a category
      // based on the event type prefix
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

        default:
          // For unknown event types, do nothing
          console.log("[SSE] Unhandled event type:", type);
      }
    },
    [queryClient]
  );

  const connect = useCallback(() => {
    // Don't connect if already connected, not enabled, or not in browser
    if (eventSourceRef.current || !enabled || typeof EventSource === "undefined") {
      return;
    }

    const eventSource = new EventSource("/api/events", {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      console.log("[SSE] Connected to event stream");
    };

    eventSource.onmessage = (messageEvent) => {
      try {
        const event: SSEEvent = JSON.parse(messageEvent.data);

        // Ignore heartbeat events - they're just to keep the connection alive
        if (event.type === "heartbeat") {
          return;
        }

        console.log("[SSE] Received event:", event.type, event.entityId || "");

        // Call user-provided handler if any
        onEvent?.(event);

        // Perform cache invalidation
        invalidateByEventType(event);
      } catch (error) {
        console.error("[SSE] Failed to parse event:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("[SSE] Connection error:", error);

      // Close the current connection
      eventSource.close();
      eventSourceRef.current = null;

      // EventSource will automatically reconnect, but if it doesn't,
      // we'll schedule a manual reconnect after a delay
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      reconnectTimeoutRef.current = setTimeout(() => {
        console.log("[SSE] Attempting to reconnect...");
        connect();
      }, 5000);
    };

    eventSourceRef.current = eventSource;
  }, [enabled, onEvent, invalidateByEventType]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      console.log("[SSE] Disconnected from event stream");
    }
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

  // Check if we're in a browser environment
  const isConnected =
    typeof EventSource !== "undefined" &&
    eventSourceRef.current?.readyState === EventSource.OPEN;

  return {
    isConnected,
    disconnect,
    reconnect: () => {
      disconnect();
      connect();
    },
  };
}
