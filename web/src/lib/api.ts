import type { DynamicStreamerData } from "./dynamicStreamer";
import { isBot, STOP_WORDS } from "./utils";

export interface SeChatter {
  rank?: number;
  login?: string;
  displayName?: string;
  username?: string;
  messages?: number;
  total?: number;
}

export interface SeEmote {
  id?: string;
  kind?: string;
  kindLabel?: string;
  rank?: number;
  name: string;
  total: number;
  url?: string | null;
}

export interface SeCommand {
  rank?: number;
  command: string;
  count?: number;
  amount?: number;
  response?: string;
}

export interface Choice {
  login: string;
  displayName: string;
  messages?: number;
}

export interface TopTarget {
  kind: "word" | "twitch" | "7tv";
  kindLabel: string;
  name: string;
  total: number;
  users?: number;
  url: string | null;
  isBrainrot?: boolean;
}

export interface LeaderboardEntry {
  login: string;
  displayName: string;
  count: number;
}

export interface Question {
  tier: number;
  prize: string;
  target: {
    kind: "word" | "twitch" | "7tv";
    kindLabel: string;
    name: string;
    url: string | null;
    totalUses: number;
  };
  answer: Choice;
  choices: Choice[];
  leaderboard: LeaderboardEntry[];
}

export interface Stats {
  days?: number;
  chatters: number;
  messages: number;
  targets: number;
  dateRange?: string;
  topChatters?: Choice[];
  topEmotes?: { kind: string; name: string; total: number; url: string | null }[];
  rarestEmotes?: { kind: string; name: string; total: number; url: string | null }[];
}

export interface FeudCategory {
  id: string;
  title: string;
  prompt: string;
  totalVolume?: number;
  answers: {
    rank: number;
    kind?: "word" | "twitch" | "7tv" | "chatter";
    kindLabel?: string;
    name: string;
    displayName?: string;
    url?: string | null;
    count: number;
    aliases?: string[];
  }[];
}

export interface ChatterLoreMatchup {
  rank: number;
  login: string;
  displayName: string;
  targetKind: "7tv" | "twitch" | "word";
  targetName: string;
  targetUrl: string | null;
  count: number;
  metric?: "messages" | "uses";
}

export interface LongestMessage {
  id?: string;
  rank?: number;
  login: string;
  displayName: string;
  text: string;
  length: number;
  words: number;
  createdAt?: string;
  vodId?: string;
}

export interface ChatterProfile {
  login: string;
  displayName: string;
  messages: number;
  rank: number;
  topTargets: {
    kind: "word" | "twitch" | "7tv";
    name: string;
    count: number;
    url: string | null;
  }[];
  timeline?: { period: string; messages: number }[];
  breakdown?: {
    emotesCount: number;
    wordsCount: number;
    totalTokens?: number;
    emoteShare: number;
    wordShare: number;
    emotesPerMsg?: number;
    wordsPerMsg?: number;
    emotesPer100Words?: number;
    uniqueEmotes?: number;
    uniqueWords?: number;
  };
  longestMessages?: LongestMessage[];
}

export const PRIZE_TIERS = [
  { tier: 1, prize: "Rescue Chatter #1", safe: false },
  { tier: 2, prize: "Rescue Chatter #2", safe: false },
  { tier: 3, prize: "Rescue Chatter #3", safe: false },
  { tier: 4, prize: "Rescue Chatter #4", safe: false },
  { tier: 5, prize: "Safe Haven Checkpoint 1 (5 Saved)", safe: true },
  { tier: 6, prize: "Rescue Chatter #6", safe: false },
  { tier: 7, prize: "Rescue Chatter #7", safe: false },
  { tier: 8, prize: "Rescue Chatter #8", safe: false },
  { tier: 9, prize: "Rescue Chatter #9", safe: false },
  { tier: 10, prize: "Safe Haven Checkpoint 2 (10 Saved)", safe: true },
  { tier: 11, prize: "Rescue Chatter #11", safe: false },
  { tier: 12, prize: "Rescue Chatter #12", safe: false },
  { tier: 13, prize: "Rescue Chatter #13", safe: false },
  { tier: 14, prize: "Rescue Chatter #14", safe: false },
  { tier: 15, prize: "Grand Rescue (All 15 Saved & Stream Preserved!)", safe: true },
];

function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function liveQuestion(
  dynamic: DynamicStreamerData,
  scope: "emotes" | "words"
): Question | null {
  const chatters = (dynamic.chatters ?? []).filter((c) => !isBot(c.login));
  const isEmote = (t: TopTarget) => t.kind === "7tv" || t.kind === "twitch";
  const isWord = (t: TopTarget) =>
    t.kind === "word" && t.name.length >= 5 && !STOP_WORDS.has(t.name.toLowerCase());
  const pool = shuffle((dynamic.targets ?? []).filter((t) => (scope === "words" ? isWord(t) : isEmote(t))));
  for (const t of pool) {
    const lb = (dynamic.leaderboards?.[`${t.kind}:${t.name}`] ?? []).filter((e) => !isBot(e.login));
    const users = new Set(lb.map((e) => e.login));
    // Skip one-off spam / private emotes: at least 3 real chatters must have used it.
    if (users.size < 3) continue;
    const answer = lb[0];
    if (!answer) continue;
    const used = new Set([answer.login]);
    const decoys: Choice[] = [];
    for (const entry of lb.slice(1)) {
      if (decoys.length >= 3) break;
      if (used.has(entry.login)) continue;
      used.add(entry.login);
      decoys.push({ login: entry.login, displayName: entry.displayName });
    }
    for (const chatter of chatters) {
      if (decoys.length >= 3) break;
      if (used.has(chatter.login)) continue;
      used.add(chatter.login);
      decoys.push({ login: chatter.login, displayName: chatter.displayName });
    }
    if (decoys.length < 3) continue;
    const choices = shuffle([{ login: answer.login, displayName: answer.displayName }, ...decoys]);
    return {
      tier: 1,
      prize: "",
      target: {
        kind: t.kind,
        kindLabel: t.kindLabel,
        name: t.name,
        url: t.url,
        totalUses: t.total,
      },
      answer: { login: answer.login, displayName: answer.displayName },
      choices,
      leaderboard: lb.slice(0, 10),
    };
  }
  return null;
}

// Active dynamic streamer data is provided by callers (from the react-query
// `useDynamicStreamerData` hook) and threaded through each accessor.

// Data provider: every accessor is driven by real per-channel data built from
// ingested archives / live StreamElements snapshots.
export const api = {

  // Generate a 15-chatter unweighted random roster from top 1-150 chatters to save (excluding bots)
  getRandomTop150Chatters: (count = 15, dynamic?: DynamicStreamerData | null): { login: string; displayName: string; rank: number }[] => {
    if (dynamic) {
      const list = (dynamic.chatters || [])
        .filter((c: Choice) => !isBot(c.login))
        .slice(0, 100)
        .map((c: Choice, idx: number) => ({
          login: c.login,
          displayName: c.displayName,
          rank: idx + 1,
        }));
      const shuffled = list.slice().sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(count, list.length));
      return selected.sort((a, b) => b.rank - a.rank);
    }
    return [];
  },

  // Build a trivia question on the fly from the live archive (targets +
  // leaderboards + chatters). Emotes by default; pass scope "words" for words.
  question: (
    dynamic?: DynamicStreamerData | null,
    scope: "emotes" | "words" = "emotes"
  ): Question => {
    const picked = dynamic ? liveQuestion(dynamic, scope) : null;
    if (picked) return picked;
    throw new Error("Not enough live chatter data to build trivia for this channel.");
  },

  // Top chatters in rank order (excluding bots)
  topChatters: (limit = 200, dynamic?: DynamicStreamerData | null): Choice[] => {
    if (dynamic) {
      return (dynamic.chatters || []).filter((c: Choice) => !isBot(c.login)).slice(0, limit);
    }
    return [];
  },

  // All indexed chatters (excluding bots)
  allChatters: (dynamic?: DynamicStreamerData | null): Choice[] => {
    if (dynamic) {
      return (dynamic.chatters || []).filter((c: Choice) => !isBot(c.login));
    }
    return [];
  },

  // All indexed targets (emotes and words)
  allTargets: (dynamic?: DynamicStreamerData | null): TopTarget[] => {
    if (dynamic) {
      return dynamic.targets || [];
    }
    return [];
  },

  // Chatter Profile with top 20 most used emotes and words
  chatterProfile: async (login: string, dynamic?: DynamicStreamerData | null): Promise<ChatterProfile | null> => {
    const clean = login.toLowerCase().trim();
    if (isBot(clean)) return null;
    if (dynamic) {
      // Deep archive: return the full profile (breakdown, timeline, top
      // targets) when one was indexed for this chatter.
      const profiles = dynamic.chatterProfiles;
      if (profiles && profiles[clean]) {
        return profiles[clean];
      }
      const idx = (dynamic.chatters || []).findIndex((c: Choice) => c.login.toLowerCase() === clean);
      if (idx === -1) return null;
      const c = dynamic.chatters[idx];
      if (isBot(c.login)) return null;
      return {
        rank: idx + 1,
        login: c.login,
        displayName: c.displayName,
        messages: c.messages ?? 0,
        topTargets: [],
      };
    }
    return null;
  },

  // Leaderboard for a target
  leaderboard: async (kind: string, name: string, limit = 200, dynamic?: DynamicStreamerData | null) => {
    if (dynamic?.leaderboards) {
      const key = `${kind}:${name}`;
      const lowerKey = `${kind}:${name.toLowerCase()}`;
      const entries = (
        dynamic.leaderboards[key] ||
        dynamic.leaderboards[lowerKey] ||
        dynamic.leaderboards[name] ||
        dynamic.leaderboards[name.toLowerCase()] ||
        []
      ).slice(0, limit);
      const target = (dynamic.targets || []).find(
        (t) => t.name.toLowerCase() === name.toLowerCase() && (!kind || t.kind === kind)
      );
      return {
        kind,
        kindLabel: kind === "7tv" ? "7TV Emote" : kind === "twitch" ? "Twitch Emote" : "Word",
        name,
        url: target?.url ?? null,
        totalUses: target?.total ?? entries.reduce((acc, e) => acc + e.count, 0),
        users: target?.users ?? entries.length,
        entries,
      };
    }
    return {
      kind,
      kindLabel: kind === "7tv" ? "7TV Emote" : kind === "twitch" ? "Twitch Emote" : "Word",
      name,
      url: null,
      totalUses: 0,
      users: 0,
      entries: [],
    };
  },

  // Search over targets
  search: async (q: string, kind?: string, limit = 10000, dynamic?: DynamicStreamerData | null): Promise<TopTarget[]> => {
    const query = q.trim().toLowerCase();
    const targets = dynamic ? (dynamic.targets || []) : [];
    return targets
      .filter((t) => {
        if (kind && t.kind !== kind) return false;
        if (!query) return true;
        return t.name.toLowerCase().includes(query);
      })
      .slice(0, limit);
  },

  // Overall Channel Stats
  stats: async (dynamic?: DynamicStreamerData | null): Promise<Stats> => {
    if (dynamic) {
      return dynamic.stats;
    }
    return {
      chatters: 0,
      messages: 0,
      targets: 0,
      topChatters: [],
      topEmotes: [],
      rarestEmotes: [],
    };
  },

  // Top targets by kind
  top: async (kind?: string, limit = 10000, dynamic?: DynamicStreamerData | null): Promise<TopTarget[]> => {
    const targets = dynamic ? (dynamic.targets || []) : [];
    return targets
      .filter((t) => (!kind ? true : t.kind === kind))
      .slice(0, limit);
  },

  // All Emotes (7TV + Twitch)
  allEmotes: (dynamic?: DynamicStreamerData | null): TopTarget[] => {
    if (dynamic) {
      return (dynamic.targets || []).filter((t) => t.kind === "7tv" || t.kind === "twitch");
    }
    return [];
  },

  // Google Feud Categories & Puzzles
  feudCategories: (dynamic?: DynamicStreamerData | null): FeudCategory[] => {
    if (dynamic) {
      return dynamic.feudCategories || [];
    }
    return [];
  },

  // Chatter Lore Head-to-Head Matchups (Higher or Lower Mode 3)
  chatterLoreMatchups: (dynamic?: DynamicStreamerData | null): ChatterLoreMatchup[] => {
    if (dynamic) {
      return (dynamic.chatterLoreMatchups || []).filter((m) => !isBot(m.login));
    }
    return [];
  },

  // Longest messages (Yap Hall of Fame)
  longestMessages: (limit = 10000, dynamic?: DynamicStreamerData | null): LongestMessage[] => {
    if (dynamic) {
      return (dynamic.longestMessages || []).filter((m) => !isBot(m.login)).slice(0, limit);
    }
    return [];
  },

  // StreamElements Stats & Metadata
  streamelementsStats: (dynamic?: DynamicStreamerData | null) => {
    if (dynamic) {
      return dynamic.streamelements?.stats || { messages: 0, chatters: 0, emotes: 0, commands: 0 };
    }
    return { messages: 0, chatters: 0, emotes: 0, commands: 0 };
  },
  streamelementsChatters: (dynamic?: DynamicStreamerData | null) => {
    if (dynamic) {
      return dynamic.streamelements?.chatters || [];
    }
    return [];
  },
  streamelementsEmotes: (dynamic?: DynamicStreamerData | null) => {
    if (dynamic) {
      return dynamic.streamelements?.emotes || { "7tv": [], twitch: [], bttv: [], ffz: [] };
    }
    return { "7tv": [], twitch: [], bttv: [], ffz: [] };
  },
  streamelementsCommands: (dynamic?: DynamicStreamerData | null) => {
    if (dynamic) {
      return dynamic.streamelements?.commands || [];
    }
    return [];
  },
};
