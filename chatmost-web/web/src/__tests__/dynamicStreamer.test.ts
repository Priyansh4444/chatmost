import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { loadDynamicStreamerData, clearStreamerMemoryCache } from "../lib/dynamicStreamer";
import { api } from "../lib/api";
import type { DynamicStreamerData } from "../lib/dynamicStreamer";

const SE_STATS_RESPONSE = {
  totalMessages: 5000,
  uniqueChatters: 120,
  chatters: [
    { name: "RealViewer", amount: 150 },
    { name: "streamelements", amount: 99999 },
    { name: "nightbot", amount: 88888 },
    { name: "AnotherViewer", amount: 75 },
  ],
  sevenTVEmotes: [{ emote: "FeelsDankMan", amount: 210 }],
  twitchEmotes: [{ emote: "Kappa", amount: 120 }],
  bttvEmotes: [{ emote: "OMEGALUL", amount: 90 }],
  ffzEmotes: [{ emote: "pog", amount: 40 }],
};

function stubLiveApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("api.streamelements.com")) {
        return new Response(JSON.stringify(SE_STATS_RESPONSE), { status: 200 });
      }
      if (url.includes("decapi.me/twitch/avatar")) {
        return new Response("https://example.com/avatar.png", { status: 200 });
      }
      if (url.includes("decapi.me/twitch/id")) {
        return new Response("123456789", { status: 200 });
      }
      if (url.includes("7tv.io/v3/users/twitch")) {
        return new Response(
          JSON.stringify({ emote_set: { emotes: [{ id: "abc", name: "FeelsDankMan" }] } }),
          { status: 200 }
        );
      }
      if (url.includes("api.betterttv.net/3/cached/users/twitch")) {
        return new Response(
          JSON.stringify({ channelEmotes: [{ id: "jkl", code: "OMEGALUL" }], sharedEmotes: [] }),
          { status: 200 }
        );
      }
      if (url.includes("api.frankerfacez.com/v1/room/id")) {
        return new Response(
          JSON.stringify({ sets: { "1": { emoticons: [{ id: 42, name: "pog" }] } } }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    })
  );
}

describe("StreamElements fallback never leaks into game surfaces", () => {
  beforeEach(() => {
    clearStreamerMemoryCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    clearStreamerMemoryCache();
  });

  it("keeps every game surface empty while preserving SE data in the SE namespace", async () => {
    stubLiveApi();
    const data: DynamicStreamerData | null = await loadDynamicStreamerData("testchannel");
    expect(data).not.toBeNull();
    if (!data) return;

    // Raw SE stats still flow into the SE tab.
    expect(data.streamelements.stats.messages).toBe(5000);
    expect(data.streamelements.chatters.map((c) => c.login)).toEqual(["realviewer", "anotherviewer"]);
    expect(data.streamelements.emotes["7tv"].map((e) => e.name)).toContain("FeelsDankMan");
    expect(data.streamelements.emotes.twitch.map((e) => e.name)).toContain("Kappa");
    expect(data.stats.messages).toBe(5000);

    // Game surfaces must stay empty — SE data is never exposed as answers.
    expect(data.chatters).toEqual([]);
    expect(data.targets).toEqual([]);
    expect(data.questions).toEqual([]);
    expect(data.higherLowerItems).toEqual([]);
    expect(data.feudCategories).toEqual([]);
    expect(data.longestMessages).toEqual([]);
    expect(data.chatterLoreMatchups).toEqual([]);
    expect(data.chatterProfiles).toEqual({});

    // Aggregate stats (hero bar / SE tab) may carry real SE counts, but they
    // must stay consistent with the SE namespace — never with game targets.
    const seEmoteCount = Object.values(data.streamelements.emotes).reduce((acc, list) => acc + list.length, 0);
    expect(data.emotesCount).toBe(seEmoteCount);
  });

  it("game accessors serve nothing from SE fallback data (chatter-vs-chat matchups included)", async () => {
    stubLiveApi();
    const data = await loadDynamicStreamerData("testchannel");
    expect(data).not.toBeNull();
    if (!data) return;

    expect(api.chatterLoreMatchups(data)).toEqual([]);
    expect(api.topChatters(10, data)).toEqual([]);
    expect(api.allChatters(data)).toEqual([]);
    expect(api.allTargets(data)).toEqual([]);
    expect(api.longestMessages(10, data)).toEqual([]);
    expect(api.feudCategories(data)).toEqual([]);
    expect(() => api.question(1, [], [], data)).toThrow(/live chatter data/);
  });

  it("still filters bot accounts out of the SE-only chatter list", async () => {
    stubLiveApi();
    const data = await loadDynamicStreamerData("testchannel");
    expect(data).not.toBeNull();
    if (!data) return;

    const logins = data.streamelements.chatters.map((c) => (c.login ?? "").toLowerCase());
    expect(logins).not.toContain("streamelements");
    expect(logins).not.toContain("nightbot");
  });
});