"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";

interface AutoApproveBudget {
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

async function fetchAutoApproveBudget(): Promise<AutoApproveBudget> {
  const response = await fetch("/api/requests/auto-approve-budget", {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error("Failed to fetch auto-approve budget");
  }

  return response.json();
}

export function useAutoApproveBudget() {
  return useQuery({
    queryKey: queryKeys.requests.autoApproveBudget(),
    queryFn: fetchAutoApproveBudget,
    staleTime: 60 * 1000, // 1 minute
  });
}
