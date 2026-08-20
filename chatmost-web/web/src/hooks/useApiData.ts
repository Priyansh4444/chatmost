import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DynamicStreamerData } from "@/lib/dynamicStreamer";

export function useStats(dynamic: DynamicStreamerData | null) {
  return useQuery({
    queryKey: ["stats", dynamic?.channel ?? "archive"],
    queryFn: () => api.stats(dynamic),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });
}