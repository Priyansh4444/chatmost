interface TimelinePoint {
  period: string;
  messages: number;
}

interface UsageEntry {
  count: number;
  displayName?: string;
}

export function buildCumulativeShare(entries: UsageEntry[]): TimelinePoint[] {
  const total = entries.reduce((sum, entry) => sum + (entry.count || 0), 0);
  if (!total || entries.length === 0) return [];

  let running = 0;
  return entries.map((entry, index) => {
    running += entry.count || 0;
    return {
      period: `#${index + 1}`,
      messages: Math.round((running / total) * 1000) / 10,
    };
  });
}
