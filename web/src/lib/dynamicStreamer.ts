/**
 * Live StreamElements + 7TV + Twitch API Data Ingestion Engine
 *
 * Ingests 100% genuine real data for any Twitch streamer:
 * 1. StreamElements API: Real total messages, unique chatters count, top 100 real chatters with exact message counts,
 *    and exact usage counts for 7TV, Twitch, BTTV, and FFZ emotes.
 * 2. DecAPI + 7TV + BTTV + FFZ: Resolves Twitch ID, avatar, and emote CDN thumbnail URLs.
 * 3. Game surfaces (Millionaire, Higher/Lower, Feuds, Profiles) intentionally stay
 *    empty here — they only run on real ingested archives, never SE fallback data.
 */

import {
  type TopTarget,
  type Question,
  type LeaderboardEntry,
  type FeudCategory,
  type LongestMessage,
  type Stats as StatsData,
  type Choice,
  type ChatterLoreMatchup,
  type ChatterProfile,
  type SeChatter,
  type SeEmote,
  type SeCommand,
} from "@/lib/api";
import { Effect, Either, Schema } from "effect";
import { fetchEmoteSetsEffect } from "./emoteSets";
import { fetchJsonWithRetryEffect, fetchTextWithRetryEffect } from "./effectHttp";
import { isBot } from "./utils";

export interface HigherLowerItem extends TopTarget {
  id: string;
  rank: number;
}

export interface DynamicStreamerData {
  channel: string;
  twitchId: string;
  avatarUrl?: string;
  emotesCount: number;
  targets: TopTarget[];
  questions: Question[];
  higherLowerItems: HigherLowerItem[];
  chatters: Choice[];
  feudCategories: FeudCategory[];
  longestMessages: LongestMessage[];
  chatterLoreMatchups: ChatterLoreMatchup[];
  chatterProfiles: Record<string, ChatterProfile>;
  stats: StatsData;
  streamelements: {
    stats: { messages: number; chatters: number; emotes: number; commands: number };
    chatters: SeChatter[];
    emotes: {
      "7tv": SeEmote[];
      twitch: SeEmote[];
      bttv: SeEmote[];
      ffz: SeEmote[];
    };
    commands: SeCommand[];
  };
  leaderboards: Record<string, LeaderboardEntry[]>;
  loadedAt: number;
}

const memoryCache = new Map<string, DynamicStreamerData>();

const streamElementsEmote = Schema.Struct({
  id: Schema.optional(Schema.String),
  emote: Schema.String,
  amount: Schema.Number,
});

const streamElementsStatsResponse = Schema.Struct({
  totalMessages: Schema.optional(Schema.Number),
  uniqueChatters: Schema.optional(Schema.Number),
  chatters: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String, amount: Schema.Number }))),
  sevenTVEmotes: Schema.optional(Schema.Array(streamElementsEmote)),
  twitchEmotes: Schema.optional(Schema.Array(streamElementsEmote)),
  bttvEmotes: Schema.optional(Schema.Array(streamElementsEmote)),
  ffzEmotes: Schema.optional(Schema.Array(streamElementsEmote)),
});

/**
 * Drop the in-session snapshot cache so the next load refetches live data.
 */
export function clearStreamerMemoryCache(): void {
  memoryCache.clear();
}

/**
 * Fetch and process live emote & community data for any Twitch streamer
 */
function loadDynamicStreamerDataEffect(rawChannel: string): Effect.Effect<DynamicStreamerData | null> {
  const channel = rawChannel.trim().toLowerCase().replace(/^#/, "").replace(/[\s-]+/g, "");
  if (!channel) return Effect.succeed(null);

  // 1. Check in-memory cache (lives only for the current page session;
  // a full page reload clears it so fresh data is fetched every time)
  if (memoryCache.has(channel)) {
    return Effect.succeed(memoryCache.get(channel)!);
  }

  return Effect.gen(function* () {
    // 2. Fetch StreamElements, avatar, and ID -> EmoteSets in parallel
    const { seRes, avatarRes, idAndEmotes } = yield* Effect.all({
      seRes: Effect.either(
        fetchJsonWithRetryEffect(`https://api.streamelements.com/kappa/v2/chatstats/${channel}/stats`).pipe(
          Effect.flatMap(Schema.decodeUnknown(streamElementsStatsResponse))
        )
      ),
      avatarRes: Effect.either(fetchTextWithRetryEffect(`https://decapi.me/twitch/avatar/${channel}`)),
      idAndEmotes: Effect.gen(function* () {
        const idRes = yield* Effect.either(fetchTextWithRetryEffect(`https://decapi.me/twitch/id/${channel}`));
        let twitchId = "";
        if (Either.isRight(idRes)) {
          const txt = idRes.right.trim();
          if (txt && !txt.includes("not found") && !isNaN(Number(txt))) {
            twitchId = txt;
          }
        }

        // Fallback: If DecAPI is down or ratelimited, resolve Twitch ID from Twitch GQL directly
        if (!twitchId) {
          const gqlRes = yield* Effect.either(
            fetchJsonWithRetryEffect<{ data?: { user?: { id?: string } } }>("https://gql.twitch.tv/gql", {
              method: "POST",
              headers: {
                "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                query: `query { user(login: "${channel}") { id } }`,
              }),
            })
          );
          if (Either.isRight(gqlRes)) {
            const gqlId = gqlRes.right.data?.user?.id;
            if (gqlId) twitchId = gqlId;
          }
        }

        const emoteSets = yield* fetchEmoteSetsEffect(twitchId);
        return { twitchId, emoteSets };
      }),
    }, { concurrency: "unbounded" });

    const twitchId = idAndEmotes.twitchId;
    const emoteSets = idAndEmotes.emoteSets;

    let avatarUrl: string | undefined;
    if (Either.isRight(avatarRes)) {
      const txt = avatarRes.right.trim();
      if (txt && txt.startsWith("http")) {
        avatarUrl = txt;
      }
    }

    // Build URL Lookup Map from 7TV, BTTV, and FFZ emote sets.
    const emoteUrlMap = new Map<string, string>();
    for (const set of [emoteSets["7tv"], emoteSets.bttv, emoteSets.ffz]) {
      for (const [name, url] of set) emoteUrlMap.set(name, url);
    }

    // Process StreamElements Real Data
    let seTotalMessages = 0;
    let seUniqueChatters = 0;
    let rawSeChatters: { name: string; amount: number }[] = [];
    let rawSe7tvEmotes: { id?: string; emote: string; amount: number }[] = [];
    let rawSeTwitchEmotes: { id?: string; emote: string; amount: number }[] = [];
    let rawSeBttvEmotes: { id?: string; emote: string; amount: number }[] = [];
    let rawSeFfzEmotes: { id?: string; emote: string; amount: number }[] = [];

    if (Either.isRight(seRes)) {
      const seData = seRes.right;
      if (seData.totalMessages) seTotalMessages = seData.totalMessages;
      if (seData.uniqueChatters) seUniqueChatters = seData.uniqueChatters;
      if (Array.isArray(seData.chatters)) rawSeChatters = seData.chatters;
      if (Array.isArray(seData.sevenTVEmotes)) rawSe7tvEmotes = seData.sevenTVEmotes;
      if (Array.isArray(seData.twitchEmotes)) rawSeTwitchEmotes = seData.twitchEmotes;
      if (Array.isArray(seData.bttvEmotes)) rawSeBttvEmotes = seData.bttvEmotes;
      if (Array.isArray(seData.ffzEmotes)) rawSeFfzEmotes = seData.ffzEmotes;
    }

    // StreamElements is one source of truth, but NOT a hard requirement:
    // channels without an SE record (404) or during an SE outage must still be
    // able to build their real archive from zonian logs / Twitch VODs. SE
    // fields simply stay empty in that case.
    if (Either.isLeft(seRes)) {
      console.warn(`No StreamElements chatstats record for #${channel}; proceeding with empty SE data.`);
    }

    // 5. Build Real Chatters List (from StreamElements, filtering out bot accounts)
    const chatters: Choice[] = [];
    for (const c of rawSeChatters) {
      const cleanName = c.name.toLowerCase().trim();
      if (isBot(cleanName)) continue;
      chatters.push({
        login: cleanName,
        displayName: c.name,
        messages: c.amount,
      });
    }

    // 6. Build Real Targets (emotes only)
    // NOTE: `targets` is kept internal — it feeds the SE tab and SE-labeled
    // stats only. SE emotes are never exposed as game answers; the exposed
    // `targets` array stays empty (games need real ingested archives).
    const targets: TopTarget[] = [];
    const seenEmotes = new Set<string>();

    const se7tvList: { rank: number; name: string; total: number; url?: string }[] = [];
    const seTwitchList: { rank: number; name: string; total: number; url?: string }[] = [];
    const seBttvList: { rank: number; name: string; total: number; url?: string }[] = [];
    const seFfzList: { rank: number; name: string; total: number; url?: string }[] = [];

    // Process 7TV Emotes from StreamElements
    for (const e of rawSe7tvEmotes) {
      const name = e.emote;
      const lower = name.toLowerCase();
      if (seenEmotes.has(lower)) continue;
      seenEmotes.add(lower);

      const url = emoteUrlMap.get(lower) || (e.id ? `https://cdn.7tv.app/emote/${e.id}/2x.webp` : null);
      targets.push({ kind: "7tv", kindLabel: "7TV Emote", name, total: e.amount, url });
      se7tvList.push({ rank: se7tvList.length + 1, name, total: e.amount, url: url || undefined });
    }

    // Process Twitch Emotes from StreamElements
    for (const e of rawSeTwitchEmotes) {
      const name = e.emote;
      const lower = name.toLowerCase();
      if (seenEmotes.has(lower)) continue;
      seenEmotes.add(lower);

      const url = e.id ? `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/2.0` : (emoteUrlMap.get(lower) || null);
      targets.push({ kind: "twitch", kindLabel: "Twitch Emote", name, total: e.amount, url });
      seTwitchList.push({ rank: seTwitchList.length + 1, name, total: e.amount, url: url || undefined });
    }

    // Process BTTV & FFZ Emotes from StreamElements
    for (const e of rawSeBttvEmotes) {
      const name = e.emote;
      const lower = name.toLowerCase();
      if (seenEmotes.has(lower)) continue;
      seenEmotes.add(lower);

      const url = emoteUrlMap.get(lower) || (e.id ? `https://cdn.betterttv.net/emote/${e.id}/2x` : null);
      targets.push({ kind: "twitch", kindLabel: "BTTV Emote", name, total: e.amount, url });
      seBttvList.push({ rank: seBttvList.length + 1, name, total: e.amount, url: url || undefined });
    }

    for (const e of rawSeFfzEmotes) {
      const name = e.emote;
      const lower = name.toLowerCase();
      if (seenEmotes.has(lower)) continue;
      seenEmotes.add(lower);

      const url = emoteUrlMap.get(lower) || (e.id ? `https://cdn.frankerfacez.com/emoticon/${e.id}/2` : null);
      targets.push({ kind: "twitch", kindLabel: "FFZ Emote", name, total: e.amount, url });
      seFfzList.push({ rank: seFfzList.length + 1, name, total: e.amount, url: url || undefined });
    }

    // Sort targets by total uses descending
    targets.sort((a, b) => b.total - a.total);

    // 7. StreamElements exposes no per-target leaderboards, per-chatter usage
    // breakdowns, yaps, slang counts, or lore matchups — those surfaces stay
    // empty for live channels instead of being fabricated.

    // 8. Millionaire Trivia is NOT exposed from SE data — game modes must only
    // run on real ingested archives. This stays empty for live fallback.
    const questions: Question[] = [];

    // 9. Higher or Lower cards are NOT exposed from SE data (same rule).
    const higherLowerItems: HigherLowerItem[] = [];

    // 10. Feud categories are NOT exposed from SE data (same rule).
    const feudCategories: FeudCategory[] = [];

    // 11. No real yaps / longest messages are available from SE — empty.
    const longestMessages: LongestMessage[] = [];

    // 12. Real chatter vs chatter matchups built from exact SE message counts:
    // each item is one real chatter whose count is their total messages. Pairs
    // are picked at game time from this pool (real data, nothing fabricated).
    // NOTE: SE-derived gameplay is intentionally NOT exposed — game modes
    // must only run on real ingested archives. This pool stays empty.
    const chatterLoreMatchups: ChatterLoreMatchup[] = [];

    // 13. Chatter profiles keep only real fields: rank and exact message count.
    // SE-derived profiles are not exposed — game modes need real archives.
    const chatterProfiles: Record<string, ChatterProfile> = {};

    // 14. Overall Streamer Stats (real only)
    const topEmotes = targets.filter((t) => t.kind === "7tv" || t.kind === "twitch");
    const stats: StatsData = {
      chatters: seUniqueChatters,
      messages: seTotalMessages,
      targets: targets.length,
      dateRange: "StreamElements Official Channel Logs",
      topChatters: chatters.slice(0, 25).map((c) => ({
        login: c.login,
        displayName: c.displayName,
        messages: c.messages ?? 0,
        percentage: seTotalMessages > 0 ? Number((((c.messages ?? 0) / seTotalMessages) * 100).toFixed(2)) : 0,
      })),
      topEmotes: topEmotes.slice(0, 25).map((t) => ({ kind: t.kind, name: t.name, total: t.total, url: t.url })),
      rarestEmotes: topEmotes.slice(-20).map((t) => ({ kind: t.kind, name: t.name, total: t.total, url: t.url })),
    };

    // 15. StreamElements Official Dataset Object (SE does not expose command stats — empty)
    const streamelements = {
      stats: {
        messages: seTotalMessages,
        chatters: seUniqueChatters,
        emotes: targets.length,
        commands: 0,
      },
      chatters: chatters.map((c, i) => ({
        rank: i + 1,
        login: c.login,
        displayName: c.displayName,
        messages: c.messages ?? 0,
      })),
      emotes: {
        "7tv": se7tvList,
        twitch: seTwitchList,
        bttv: seBttvList,
        ffz: seFfzList,
      },
      commands: [],
    };

    const dynamicData: DynamicStreamerData = {
      channel,
      twitchId,
      avatarUrl,
      emotesCount: targets.length,
      // SE emotes are NOT exposed as answers: lexicon/Higher-Lower/trivia
      // must only ever run on real ingested archives.
      targets: [],
      questions,
      higherLowerItems,
      chatters: [],
      feudCategories,
      longestMessages,
      chatterLoreMatchups,
      chatterProfiles,
      stats,
      streamelements,
      leaderboards: {},
      loadedAt: Date.now(),
    };

    memoryCache.set(channel, dynamicData);

    return dynamicData;
  }).pipe(
    Effect.catchAllCause((cause) => Effect.sync(() => {
      console.error(`Failed to dynamically fetch data for streamer #${channel}:`, cause);
      return null;
    }))
  );
}

export function loadDynamicStreamerData(rawChannel: string): Promise<DynamicStreamerData | null> {
  return Effect.runPromise(loadDynamicStreamerDataEffect(rawChannel));
}
