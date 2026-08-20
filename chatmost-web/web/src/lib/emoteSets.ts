import { Effect, Either, Schema } from "effect";
import { fetchJsonWithRetryEffect } from "./effectHttp";

export interface EmoteSets {
  "7tv": Map<string, string>;
  bttv: Map<string, string>;
  ffz: Map<string, string>;
}

const sevenTvResponse = Schema.Struct({
  emote_set: Schema.optional(Schema.Struct({
    emotes: Schema.optional(Schema.Array(Schema.Struct({ id: Schema.String, name: Schema.String }))),
  })),
});

const betterTtvEmote = Schema.Struct({ id: Schema.String, code: Schema.String });
const betterTtvResponse = Schema.Struct({
  channelEmotes: Schema.optional(Schema.Array(betterTtvEmote)),
  sharedEmotes: Schema.optional(Schema.Array(betterTtvEmote)),
});

const frankerFaceZResponse = Schema.Struct({
  sets: Schema.optional(Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      emoticons: Schema.optional(Schema.Array(Schema.Struct({
        id: Schema.Number,
        name: Schema.String,
        urls: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
      }))),
    }),
  })),
});

/**
 * Fetch third-party emote sets (7TV / BTTV / FFZ) for a Twitch user and return
 * name -> CDN URL maps. Shared by the fast SE-based ingestion and the full
 * chat-archive builder so both tokenize messages identically.
 */
export function fetchEmoteSetsEffect(
  twitchId: string,
  isCancelled: () => boolean = () => false
): Effect.Effect<EmoteSets> {
  const cleanId = twitchId?.trim() ?? "";
  if (!cleanId) {
    return Effect.succeed({ "7tv": new Map(), bttv: new Map(), ffz: new Map() });
  }

  const policy = { retries: 3, baseBackoffMs: 250, jitterMs: 150 } as const;
  return Effect.gen(function* () {
    const sets: EmoteSets = { "7tv": new Map(), bttv: new Map(), ffz: new Map() };
    const [tv7Res, bttvRes, ffzRes] = yield* Effect.all([
      fetchJsonWithRetryEffect(`https://7tv.io/v3/users/twitch/${twitchId}`, {}, isCancelled, policy).pipe(
        Effect.flatMap(Schema.decodeUnknown(sevenTvResponse))
      ),
      fetchJsonWithRetryEffect(`https://api.betterttv.net/3/cached/users/twitch/${twitchId}`, {}, isCancelled, policy).pipe(
        Effect.flatMap(Schema.decodeUnknown(betterTtvResponse))
      ),
      fetchJsonWithRetryEffect(`https://api.frankerfacez.com/v1/room/id/${twitchId}`, {}, isCancelled, policy).pipe(
        Effect.flatMap(Schema.decodeUnknown(frankerFaceZResponse))
      ),
    ], { concurrency: "unbounded", mode: "either" });

    if (Either.isRight(tv7Res)) {
      const tv7Data = tv7Res.right;
      const emotesList = tv7Data.emote_set?.emotes ?? [];
      for (const e of emotesList) {
        const url = `https://cdn.7tv.app/emote/${e.id}/2x.webp`;
        // 7TV emote names are case-sensitive ("LO" and "lo" are distinct emotes).
        sets["7tv"].set(e.name, url);
      }
    }

    if (Either.isRight(bttvRes)) {
      const bttvData = bttvRes.right;
      const allBttv = [...(bttvData.channelEmotes ?? []), ...(bttvData.sharedEmotes ?? [])];
      for (const e of allBttv) {
        // BTTV emote codes are case-sensitive too.
        sets.bttv.set(e.code, `https://cdn.betterttv.net/emote/${e.id}/2x`);
      }
    }

    if (Either.isRight(ffzRes)) {
      const ffzData = ffzRes.right;
      const ffzSets = ffzData.sets ?? {};
      for (const setId of Object.keys(ffzSets)) {
        const emList = ffzSets[setId]?.emoticons ?? [];
        for (const e of emList) {
          const url = e.urls?.["2"] || e.urls?.["1"] || `https://cdn.frankerfacez.com/emoticon/${e.id}/2`;
          // FFZ matching is case-insensitive — keys stay lowercase.
          sets.ffz.set(e.name.toLowerCase(), url);
        }
      }
    }

    return sets;
  });
}

export function fetchEmoteSets(twitchId: string, isCancelled: () => boolean = () => false): Promise<EmoteSets> {
  return Effect.runPromise(fetchEmoteSetsEffect(twitchId, isCancelled));
}
