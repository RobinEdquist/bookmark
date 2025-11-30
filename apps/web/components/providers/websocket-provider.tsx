"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useWebSocket } from "../../lib/use-websocket";

interface WebSocketContextValue {
  isConnected: boolean;
  emit: (event: string, data: unknown) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

interface WebSocketProviderProps {
  children: ReactNode;
  enabled?: boolean;
}

export function WebSocketProvider({
  children,
  enabled = true,
}: WebSocketProviderProps) {
  const ws = useWebSocket({ enabled });

  return (
    <WebSocketContext.Provider
      value={{ isConnected: ws.isConnected, emit: ws.emit }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocketContext must be used within WebSocketProvider"
    );
  }
  return context;
}
