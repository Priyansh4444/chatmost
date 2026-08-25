import type { Choice, ChatterLoreMatchup, TopTarget } from "@/lib/api";
import { isBot } from "@/lib/utils";

export interface ChatterItem extends Choice {
  rank: number;
}

export interface EmoteItem extends TopTarget {
  rank: number;
}

export interface MatchupItem extends ChatterLoreMatchup {
  rank: number;
}

const isEmoteTarget = (m: { targetKind: string }) => m.targetKind === "7tv" || m.targetKind === "twitch";

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickNextChatter(currentA: ChatterItem, all: ChatterItem[], _streak = 0, excluded: string[] = []) {
  const available = (item: ChatterItem) => item.login !== currentA.login && !excluded.includes(`c:${item.login}`);
  const count = currentA.messages || 1;
  const ratio = all.filter((item) => available(item) && (item.messages || 1) / count >= 0.72 && (item.messages || 1) / count <= 1.38 && Math.abs((item.messages || 0) - count) >= 10);
  if (ratio.length) return ratio[Math.floor(Math.random() * ratio.length)];
  const ranked = all.filter((item) => available(item) && Math.abs(item.rank - currentA.rank) >= 2 && Math.abs(item.rank - currentA.rank) <= 45);
  if (ranked.length) return ranked[Math.floor(Math.random() * ranked.length)];
  const others = all.filter(available);
  const pool = others.length ? others : all.filter((item) => item.login !== currentA.login);
  return pool[Math.floor(Math.random() * pool.length)] || currentA;
}

export function pickNextEmote(currentA: EmoteItem, all: EmoteItem[], _streak = 0, excluded: string[] = []) {
  const different = (item: EmoteItem) => item.name !== currentA.name || item.kind !== currentA.kind;
  const available = (item: EmoteItem) => different(item) && !excluded.includes(`e:${item.kind}:${item.name}`);
  const count = currentA.total || 1;
  const ratio = all.filter((item) => available(item) && (item.total || 1) / count >= 0.72 && (item.total || 1) / count <= 1.38 && Math.abs(item.total - count) >= 10);
  if (ratio.length) return ratio[Math.floor(Math.random() * ratio.length)];
  const ranked = all.filter((item) => available(item) && Math.abs(item.rank - currentA.rank) >= 2 && Math.abs(item.rank - currentA.rank) <= 45);
  if (ranked.length) return ranked[Math.floor(Math.random() * ranked.length)];
  const others = all.filter(available);
  const pool = others.length ? others : all.filter(different);
  return pool[Math.floor(Math.random() * pool.length)] || currentA;
}

export function pickNextMatchup(currentA: MatchupItem, all: MatchupItem[], _streak = 0, excluded: string[] = []) {
  const different = (item: MatchupItem) => item.login !== currentA.login || item.targetName !== currentA.targetName;
  const others = all.filter((item) => different(item) && !excluded.includes(`m:${item.login}|${item.targetName}`));
  if (!others.length) {
    const fallback = all.filter(different);
    return fallback[Math.floor(Math.random() * fallback.length)] || currentA;
  }
  const close = others.filter((item) => (item.count || 1) / (currentA.count || 1) >= 0.5 && (item.count || 1) / (currentA.count || 1) <= 2);
  const pool = close.length ? close : others;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Randomized opening card for matchups mode.
 */
export function pickPrioritizedMatchup(all: MatchupItem[]): MatchupItem | undefined {
  if (!all.length) return undefined;
  return all[Math.floor(Math.random() * all.length)];
}

export function buildMatchups(items: ChatterLoreMatchup[]): MatchupItem[] {
  const clean = items.filter(
    (m) => !isBot(m.login) && isEmoteTarget(m)
  );

  // Shuffle so each run starts from a fresh ordering (the raw pool arrives in
  // rank order, which made opening cards predictable across runs).
  return shuffle(clean).map((item, idx) => ({ ...item, rank: idx + 1 }));
}
