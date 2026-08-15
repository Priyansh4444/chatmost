import { createContext, useContext, createElement, type ReactNode } from "react";
import dataset from "../data/dataset.json";
import streamelementsDataset from "../data/streamelements-dataset.json";
import { convexHttpClient, isConvexActive } from "./convex";

export interface Target {
  kind: "word" | "twitch" | "7tv";
  kindLabel: string;
  name: string;
  url: string | null;
  totalUses: number;
  isSlang?: boolean;
}

export interface Choice {
  login: string;
  displayName: string;
  messages?: number;
}

export interface LeaderboardEntry {
  login: string;
  displayName: string;
  count: number;
}

export interface Question {
  tier: number; // 1 to 15
  prize: string;
  target: Target;
  answer: Choice;
  choices: Choice[];
  leaderboard: LeaderboardEntry[];
}

export interface Stats {
  chatters: number;
  messages: number;
  targets: number;
  dateRange?: string;
  topChatters: { login: string; displayName: string; messages: number }[];
  topEmotes: { kind: string; name: string; total: number; url: string | null }[];
  rarestEmotes?: { kind: string; name: string; total: number; url: string | null; users?: number }[];
  topSlang: { kind: string; name: string; total: number; url: string | null }[];
  topBrainrot?: { kind: string; name: string; total: number; url: string | null }[];
}

export interface TopTarget {
  kind: string;
  kindLabel: string;
  name: string;
  total: number;
  users: number;
  url: string | null;
  isSlang?: boolean;
}

export interface FeudCategory {
  id: string;
  title: string;
  prompt: string;
  answers: { rank: number; name: string; count: number; url?: string | null }[];
}

export interface ChatterProfile {
  rank: number;
  login: string;
  displayName: string;
  messages: number;
  topTargets: {
    kind: string;
    name: string;
    count: number;
    url: string | null;
  }[];
  timeline?: { period: string; messages: number }[];
  breakdown?: {
    emotesCount: number;
    wordsCount: number;
    emoteShare: number;
    wordShare: number;
  };
}

export const PRIZE_TIERS = [
  { tier: 1, prize: "$100", safe: false },
  { tier: 2, prize: "$200", safe: false },
  { tier: 3, prize: "$300", safe: false },
  { tier: 4, prize: "$500", safe: false },
  { tier: 5, prize: "$1,000", safe: true }, // Safe Haven 1
  { tier: 6, prize: "$2,000", safe: false },
  { tier: 7, prize: "$4,000", safe: false },
  { tier: 8, prize: "$8,000", safe: false },
  { tier: 9, prize: "$16,000", safe: false },
  { tier: 10, prize: "$32,000", safe: true }, // Safe Haven 2
  { tier: 11, prize: "$64,000", safe: false },
  { tier: 12, prize: "$125,000", safe: false },
  { tier: 13, prize: "$250,000", safe: false },
  { tier: 14, prize: "$500,000", safe: false },
  { tier: 15, prize: "$1,000,000", safe: true }, // Grand Prize
];

// Helper to select targets based on Millionaire Tier ensuring chatter diversity, niche emote focus, and tight competitive margins
function selectTargetForTier(
  tier: number,
  excludeNames: Set<string> = new Set(),
  excludeAnswerLogins: Set<string> = new Set()
) {
  const allTargets = dataset.targets as TopTarget[];
  const leaderboards = dataset.leaderboards as Record<string, LeaderboardEntry[]>;

  // Filter candidate targets: Focus strictly on 7TV/Twitch Emotes and Channel Slang/Memes
  const validTargets = allTargets.filter(
    (t) =>
      !excludeNames.has(t.name) &&
      (t.kind === "7tv" || t.kind === "twitch" || t.isSlang || (t as any).isBrainrot)
  );

  // Helper to test if a target has a unique (not yet asked) #1 chatter answer
  const hasUniqueAnswer = (t: TopTarget) => {
    const key = `${t.kind}:${t.name}`;
    const lb = leaderboards[key] || leaderboards[t.name];
    if (!lb || lb.length === 0) return true;
    return !excludeAnswerLogins.has(lb[0].login);
  };

  // Helper to test if top 2 chatters are close in count (ratio <= 1.55, avoiding huge runaway gaps)
  const isCompetitive = (t: TopTarget) => {
    const key = `${t.kind}:${t.name}`;
    const lb = leaderboards[key] || leaderboards[t.name];
    if (!lb || lb.length < 2) return true;
    const top1 = lb[0].count;
    const top2 = lb[1].count;
    if (top2 <= 0) return true;
    return top1 / top2 <= 1.55;
  };

  // Tiers 1-4: High-energy viral emotes and iconic channel slang with tight margins
  if (tier <= 4) {
    const pool = validTargets.filter((t) => t.total >= 1000 && (t.isSlang || (t as any).isBrainrot || t.kind === "7tv" || t.kind === "twitch"));
    const tightPool = pool.filter((t) => hasUniqueAnswer(t) && isCompetitive(t));
    if (tightPool.length > 0) return tightPool[Math.floor(Math.random() * tightPool.length)];
    const diversePool = pool.filter(hasUniqueAnswer);
    if (diversePool.length > 0) return diversePool[Math.floor(Math.random() * diversePool.length)];
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  }

  // Tiers 5-9: Medium tier emotes & channel lore with tight margins
  if (tier >= 5 && tier <= 9) {
    const pool = validTargets.filter((t) => t.total >= 200 && t.total <= 3500);
    const tightPool = pool.filter((t) => hasUniqueAnswer(t) && isCompetitive(t));
    if (tightPool.length > 0) return tightPool[Math.floor(Math.random() * tightPool.length)];
    const diversePool = pool.filter(hasUniqueAnswer);
    if (diversePool.length > 0) return diversePool[Math.floor(Math.random() * diversePool.length)];
    if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  }

  // Tiers 10-15: Deep chat lore, rare channel emotes, niche targets with tight margins
  const pool = validTargets.filter((t) => t.total >= 15 && t.total <= 700);
  const tightPool = pool.filter((t) => hasUniqueAnswer(t) && isCompetitive(t));
  if (tightPool.length > 0) return tightPool[Math.floor(Math.random() * tightPool.length)];
  const diversePool = pool.filter(hasUniqueAnswer);
  if (diversePool.length > 0) return diversePool[Math.floor(Math.random() * diversePool.length)];
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];

  return validTargets[Math.floor(Math.random() * validTargets.length)] || allTargets[0];
}

// Data provider with Convex backend bridge + local offline fallback
export const api = {
  // Generate a Millionaire Question with Answer Diversity
  question: async (
    tier = 1,
    excludeNames: string[] = [],
    excludeAnswerLogins: string[] = []
  ): Promise<Question> => {
    // If Convex is configured and reachable, attempt Convex query
    if (isConvexActive && convexHttpClient) {
      try {
        const convexQuestion = (await convexHttpClient.query("quiz:getQuestion" as any, {
          tier,
        })) as Question | null;

        if (convexQuestion && convexQuestion.choices?.length === 4) {
          return convexQuestion;
        }
      } catch (err) {
        console.warn("Convex query fallback to local archive:", err);
      }
    }

    // Local embedded dataset resolution
    const excludeSet = new Set(excludeNames);
    const excludeAnswerSet = new Set(excludeAnswerLogins);
    const target = selectTargetForTier(tier, excludeSet, excludeAnswerSet);
    const key = `${target.kind}:${target.name}`;

    const leaderboards = dataset.leaderboards as Record<string, LeaderboardEntry[]>;
    let lb = leaderboards[key] || leaderboards[target.name];

    if (!lb || lb.length === 0) {
      // Fallback leaderboard from chatters
      lb = (dataset.chatters as Choice[]).slice(0, 10).map((c, i) => ({
        login: c.login,
        displayName: c.displayName,
        count: Math.max(10, Math.floor(target.total * (0.4 / (i + 1)))),
      }));
    }

    const answer = { login: lb[0].login, displayName: lb[0].displayName };

    // Select 3 runner-up decoys directly from the target's actual leaderboard (local minima)
    const candidateDecoys: Choice[] = [];
    for (let i = 1; i < lb.length && candidateDecoys.length < 3; i++) {
      if (lb[i].login !== answer.login && !candidateDecoys.some((d) => d.login === lb[i].login)) {
        candidateDecoys.push({ login: lb[i].login, displayName: lb[i].displayName });
      }
    }

    // If fewer than 3 runners-up typed this target, fill remaining slots with top chatters
    if (candidateDecoys.length < 3) {
      const allChatters = dataset.chatters as Choice[];
      for (const c of allChatters) {
        if (c.login !== answer.login && !candidateDecoys.some((d) => d.login === c.login)) {
          candidateDecoys.push({ login: c.login, displayName: c.displayName });
          if (candidateDecoys.length >= 3) break;
        }
      }
    }

    const choices = [answer, ...candidateDecoys.slice(0, 3)].sort(() => Math.random() - 0.5);

    const prizeInfo = PRIZE_TIERS[Math.min(tier, 15) - 1] || PRIZE_TIERS[0];

    return {
      tier,
      prize: prizeInfo.prize,
      target: {
        kind: target.kind as "word" | "twitch" | "7tv",
        kindLabel: target.kind === "7tv" ? "7TV Emote" : target.kind === "twitch" ? "Twitch Emote" : "Word",
        name: target.name,
        url: target.url,
        totalUses: target.total,
        isSlang: target.isSlang || (target as any).isBrainrot,
      },
      answer,
      choices,
      leaderboard: lb,
    };
  },

  // Top 200 most active chatters (people who chatted the most)
  topChatters: (limit = 200): Choice[] => {
    const all = dataset.chatters as Choice[];
    return all.slice(0, limit);
  },

  // All indexed chatters
  allChatters: (): Choice[] => {
    return dataset.chatters as Choice[];
  },

  // All indexed targets (emotes and words)
  allTargets: (): TopTarget[] => {
    return dataset.targets as TopTarget[];
  },

  // Chatter Profile with top 20 most used emotes and words
  chatterProfile: async (login: string): Promise<ChatterProfile | null> => {
    const clean = login.toLowerCase().trim();
    const profiles = (dataset as any).chatterProfiles as Record<string, ChatterProfile>;
    if (profiles && profiles[clean]) {
      return profiles[clean];
    }
    const all = dataset.chatters as Choice[];
    const idx = all.findIndex((c) => c.login.toLowerCase() === clean);
    if (idx === -1) return null;
    const c = all[idx];
    return {
      rank: idx + 1,
      login: c.login,
      displayName: c.displayName,
      messages: c.messages ?? 0,
      topTargets: [],
    };
  },

  // Leaderboard for a target (returns full leaderboard without artificial cap)
  leaderboard: async (kind: string, name: string, limit = 200) => {
    const key = `${kind}:${name}`;
    const leaderboards = dataset.leaderboards as Record<string, LeaderboardEntry[]>;
    const entries = (leaderboards[key] || leaderboards[name] || []).slice(0, limit);
    const target = (dataset.targets as TopTarget[]).find((t) => t.kind === kind && t.name === name);

    return {
      kind,
      kindLabel: kind === "7tv" ? "7TV Emote" : kind === "twitch" ? "Twitch Emote" : "Word",
      name,
      url: target?.url ?? null,
      totalUses: target?.total ?? 0,
      users: target?.users ?? entries.length,
      entries,
    };
  },

  // Search over targets
  search: async (q: string, kind?: string, limit = 10000): Promise<TopTarget[]> => {
    const query = q.trim().toLowerCase();
    const targets = dataset.targets as TopTarget[];
    return targets
      .filter((t) => {
        if (kind && t.kind !== kind) return false;
        if (!query) return true;
        return t.name.toLowerCase().includes(query);
      })
      .slice(0, limit);
  },

  // Overall Channel Stats
  stats: async (): Promise<Stats> => {
    if (isConvexActive && convexHttpClient) {
      try {
        const convexStats = (await convexHttpClient.query("quiz:getStats" as any, {})) as Stats | null;
        if (convexStats) return convexStats;
      } catch (err) {
        console.warn("Convex stats fallback to local archive:", err);
      }
    }

    const s = dataset.stats;
    const slangList = (s as any).topSlang || (s as any).topBrainrot || [];
    return {
      chatters: s.chatters,
      messages: s.messages,
      targets: s.targets,
      dateRange: (s as any).dateRange || "August 25, 2025 – August 14, 2026",
      topChatters: s.topChatters,
      topEmotes: s.topEmotes as { kind: string; name: string; total: number; url: string | null }[],
      rarestEmotes: (s as any).rarestEmotes || [],
      topSlang: slangList as { kind: string; name: string; total: number; url: string | null }[],
      topBrainrot: slangList as { kind: string; name: string; total: number; url: string | null }[],
    };
  },

  // Submit Feud score to Convex
  submitFeudScore: async (scoreData: {
    playerName: string;
    score: number;
    strikes: number;
    category: string;
  }) => {
    if (isConvexActive && convexHttpClient) {
      try {
        await convexHttpClient.mutation("quiz:submitFeudScore" as any, scoreData);
      } catch (err) {
        console.warn("Failed to record score in Convex:", err);
      }
    }
  },

  // Top targets by kind (all targets, not capped at 20 or 50)
  top: async (kind?: string, limit = 10000): Promise<TopTarget[]> => {
    const targets = dataset.targets as TopTarget[];
    return targets
      .filter((t) => (!kind ? true : t.kind === kind))
      .slice(0, limit);
  },

  // All Emotes (7TV + Twitch)
  allEmotes: (): TopTarget[] => {
    const targets = dataset.targets as TopTarget[];
    return targets.filter((t) => t.kind === "7tv" || t.kind === "twitch");
  },

  // Google Feud Categories & Puzzles
  feudCategories: (): FeudCategory[] => {
    const s = dataset.stats;
    const targets = dataset.targets as TopTarget[];
    const leaderboards = dataset.leaderboards as Record<string, LeaderboardEntry[]>;
    const slangList = (s as any).topSlang || (s as any).topBrainrot || [];

    const list: FeudCategory[] = [
      {
        id: "top-chatters",
        title: "All-Time Top Chatters",
        prompt: "Who are the top 10 most active chatters in jo2uke's chat?",
        answers: s.topChatters.slice(0, 10).map((c, i) => ({
          rank: i + 1,
          name: c.displayName,
          count: c.messages,
        })),
      },
      {
        id: "top-emotes",
        title: "Top Channel Emotes",
        prompt: "What are the top 10 most-used emotes (7TV & Twitch)?",
        answers: s.topEmotes.slice(0, 10).map((e, i) => ({
          rank: i + 1,
          name: e.name,
          count: e.total,
          url: e.url,
        })),
      },
      {
        id: "top-slang",
        title: "Iconic Community Slang",
        prompt: "What are the top 10 most typed community slang words?",
        answers: slangList.slice(0, 10).map((w: any, i: number) => ({
          rank: i + 1,
          name: w.name,
          count: w.total,
        })),
      },
    ];

    // Add dynamic feud categories for top words/emotes
    const sampleWords = ["pronsh", "pronshing", "freaky", "chud", "LO", "guuh", "karman", "aga", "Damn", "hi", "huh", "boutyh0ieburgular"];
    for (const name of sampleWords) {
      const match = targets.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (match) {
        const lb = leaderboards[`${match.kind}:${match.name}`] || leaderboards[match.name];
        if (lb && lb.length >= 6) {
          list.push({
            id: `target-${match.kind}-${match.name}`,
            title: `Who typed "${match.name}"?`,
            prompt: `Who are the top chatters that typed the ${match.kind === "word" ? "word" : "emote"} "${match.name}"?`,
            answers: lb.slice(0, 10).map((r, i) => ({
              rank: i + 1,
              name: r.displayName,
              count: r.count,
              url: match.url,
            })),
          });
        }
      }
    }

    return list;
  },

  // StreamElements Stats & Metadata
  streamelementsStats: () => {
    return streamelementsDataset.stats;
  },
  streamelementsChatters: () => {
    return streamelementsDataset.chatters;
  },
  streamelementsEmotes: () => {
    return streamelementsDataset.emotes;
  },
  streamelementsCommands: () => {
    return streamelementsDataset.commands;
  },
};

const ApiContext = createContext<typeof api>(api);

export function ApiProvider({ children }: { children: ReactNode }) {
  return createElement(ApiContext.Provider, { value: api }, children);
}

export function useApi() {
  return useContext(ApiContext);
}