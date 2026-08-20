import { describe, it, expect, vi, afterEach } from "vitest";
import { scanEmotes, extractWords, isEmoteSpam, buildMatchers, fetchWithRetry, isUsableArchive, setBaseBackoffMs, serializeAggregate, deserializeAggregate, zonianFetchDay, setZonianRetryConfig, buildChatArchive, incrementalArchiveUpdate, type CachedArchive, type SerializedAggregate } from "../lib/chatIngest";
import type { DynamicStreamerData } from "../lib/dynamicStreamer";

// `buildChatArchive` fetches live 7TV/BTTV/FFZ emote sets; tests stub this so
// archive-building tests run offline with empty sets.
vi.mock("../lib/emoteSets", () => ({
  fetchEmoteSets: vi.fn(async () => ({ "7tv": new Map(), bttv: new Map(), ffz: new Map() })),
}));

// Keep backoff sleeps tiny so retry tests stay fast.
setBaseBackoffMs(1);

const TEST_SETS = {
  "7tv": new Map([
    ["FeelsDankMan", "https://cdn.7tv.app/emote/abc/2x.webp"],
    ["monka", "https://cdn.7tv.app/emote/def/2x.webp"],
    ["monkaS", "https://cdn.7tv.app/emote/ghi/2x.webp"],
  ]),
  bttv: new Map([["OMEGALUL", "https://cdn.betterttv.net/emote/jkl/2x"]]),
  ffz: new Map([["pog", "https://cdn.frankerfacez.com/emoticon/xyz/2"]]),
};

const matchers = buildMatchers(TEST_SETS);

describe("chat ingest tokenizer", () => {
  it("matches 7TV/BTTV emotes case-sensitively and prefers the longest name", () => {
    const spans = scanEmotes("monka monkaS monka everything", matchers);
    const names = spans.map((s) => s.name);
    expect(names).toContain("monkaS");
    expect(names).toContain("monka");
    expect(names.filter((n) => n === "monkaS")).toHaveLength(1);
    expect(spans.every((s) => s.url !== null)).toBe(true);
  });

  it("does not match case-distinct 7TV/BTTV names across case", () => {
    expect(scanEmotes("MONKA", matchers)).toHaveLength(0);
    expect(scanEmotes("omegalu", matchers)).toHaveLength(0);
    expect(scanEmotes("OMEGALUL", matchers).map((s) => s.name)).toEqual(["OMEGALUL"]);
  });

  it("keeps case-distinct emotes separate (LO vs lo)", () => {
    const m = buildMatchers({
      "7tv": new Map([
        ["LO", "https://cdn.7tv.app/emote/a/2x.webp"],
        ["lo", "https://cdn.7tv.app/emote/b/2x.webp"],
      ]),
      bttv: new Map(),
      ffz: new Map(),
    });
    const spans = scanEmotes("LO lo", m);
    expect(spans.map((s) => s.name)).toEqual(["LO", "lo"]);
    expect(spans[0].url).toBe("https://cdn.7tv.app/emote/a/2x.webp");
    expect(spans[1].url).toBe("https://cdn.7tv.app/emote/b/2x.webp");
  });

  it("matches FFZ case-insensitively and normalizes to lowercase", () => {
    const spans = scanEmotes("POG pog", matchers);
    expect(spans.map((s) => s.name)).toEqual(["pog", "pog"]);
    expect(spans.every((s) => s.url === "https://cdn.frankerfacez.com/emoticon/xyz/2")).toBe(true);
  });

  it("does not produce zero-length spans for empty emote sets", () => {
    const empty = buildMatchers({ "7tv": new Map(), bttv: new Map(), ffz: new Map() });
    const spans = scanEmotes("just some words here", empty);
    expect(spans).toHaveLength(0);
  });

  it("excludes emote text from word extraction and drops stopwords", () => {
    const spans = scanEmotes("FeelsDankMan happy the chat", matchers);
    const words = extractWords("FeelsDankMan happy the chat", spans);
    expect(words).toEqual(["happy", "chat"]);
  });

  it("flags repeated emote spam but passes normal sentences", () => {
    expect(isEmoteSpam(["feelsdankman", "feelsdankman", "feelsdankman", "feelsdankman", "feelsdankman"])).toBe(true);
    expect(isEmoteSpam(["watching", "the", "stream", "with", "friends"])).toBe(false);
  });

  it("handles mixed word/emote sentences without consuming word boundaries", () => {
    const spans = scanEmotes("this OMEGALUL is hype", matchers);
    const words = extractWords("this OMEGALUL is hype", spans);
    expect(words).toContain("hype");
    expect(words).not.toContain("omegalu");
    expect(words).not.toContain("lul");
  });
});

describe("fetchWithRetry backoff", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries transient 5xx and succeeds on a later attempt", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls < 3) return new Response("boom", { status: 502 });
        return new Response("ok", { status: 200 });
      })
    );
    const res = await fetchWithRetry("https://example.test/x", {}, () => false);
    expect(res.status).toBe(200);
    expect(calls).toBe(3);
  });

  it("retries network errors (TypeError) with backoff", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        if (calls < 2) throw new TypeError("NetworkError when attempting to fetch resource.");
        return new Response("ok", { status: 200 });
      })
    );
    const res = await fetchWithRetry("https://example.test/x", {}, () => false);
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  it("does not retry 4xx client errors", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response("nope", { status: 404 });
      })
    );
    await expect(fetchWithRetry("https://example.test/x", {}, () => false)).rejects.toThrow("HTTP 404");
    expect(calls).toBe(1);
  });

  it("gives up after exhausting retries", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return new Response("down", { status: 503 });
      })
    );
    await expect(fetchWithRetry("https://example.test/x", {}, () => false)).rejects.toThrow("HTTP 503");
    expect(calls).toBe(4);
  });
});

describe("zonian day fetch completeness & resume", () => {
  const day = { year: "2026", month: "08", day: "20" };

  afterEach(() => {
    vi.unstubAllGlobals();
    setZonianRetryConfig({ maxAttempts: 8, baseDelayMs: 500 });
  });

  const page = (texts: string[]) => ({
    messages: texts.map((text, i) => ({
      text,
      username: "viewer",
      timestamp: "2026-08-20T00:00:00.000Z",
      id: `msg-${i}`,
    })),
  });

  it("fetches all pages and reports complete when the day ends on a short page", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("offset=0")) return new Response(JSON.stringify(page(Array(1000).fill("hello"))), { status: 200 });
        return new Response(JSON.stringify(page(["bye"])), { status: 200 });
      })
    );
    const received: string[][] = [];
    const result = await zonianFetchDay("testchannel", day, () => false, (batch) => received.push(batch.map((m) => m.text)));
    expect(result.complete).toBe(true);
    expect(result.messages).toBe(1001);
    expect(received).toEqual([Array(1000).fill("hello"), ["bye"]]);
  });

  it("reports incomplete with the resume offset when a page keeps rate-limiting", async () => {
    setZonianRetryConfig({ maxAttempts: 3, baseDelayMs: 1 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("offset=0")) return new Response(JSON.stringify(page(Array(1000).fill("hello"))), { status: 200 });
        return new Response("rate limited", { status: 429 });
      })
    );
    const received: string[][] = [];
    const result = await zonianFetchDay("testchannel", day, () => false, (batch) => received.push(batch.map((m) => m.text)));
    expect(result.complete).toBe(false);
    expect(result.nextOffset).toBe(1000);
    expect(result.messages).toBe(1000);
    expect(received).toHaveLength(1);
  });

  it("resumes from startOffset without re-reading earlier pages", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("offset=1000")) return new Response(JSON.stringify(page(["one", "two"])), { status: 200 });
        return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      })
    );
    const received: string[][] = [];
    const result = await zonianFetchDay("testchannel", day, () => false, (batch) => received.push(batch.map((m) => m.text)), 1000);
    expect(result.complete).toBe(true);
    expect(result.messages).toBe(2);
    expect(calls.some((c) => c.includes("offset=0"))).toBe(false);
    expect(calls.some((c) => c.includes("offset=1000"))).toBe(true);
  });
});

describe("archive builder marks only complete zonian days as ingested", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setZonianRetryConfig({ maxAttempts: 8, baseDelayMs: 500 });
  });

  const seData = {
    channel: "testchannel",
    twitchId: "123456789",
    avatarUrl: "https://example.com/avatar.png",
    emotesCount: 0,
    targets: [],
    questions: [],
    higherLowerItems: [],
    chatters: [],
    feudCategories: [],
    longestMessages: [],
    chatterLoreMatchups: [],
    chatterProfiles: {},
    stats: { chatters: 0, messages: 0, targets: 0 },
    streamelements: { stats: { messages: 0, chatters: 0, emotes: 0, commands: 0 }, chatters: [], emotes: { "7tv": [], twitch: [], bttv: [], ffz: [] }, commands: [] },
    leaderboards: {},
    loadedAt: Date.now(),
  } as DynamicStreamerData;

  it("keeps failed days out of ingestedDays and records a resume offset", async () => {
    setZonianRetryConfig({ maxAttempts: 3, baseDelayMs: 1 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/list?channel=")) {
          return new Response(JSON.stringify({ availableLogs: [{ year: "2026", month: "8", day: "20" }, { year: "2026", month: "8", day: "19" }] }), { status: 200 });
        }
        // 08-20 succeeds, 08-19 keeps rate-limiting.
        if (url.includes("2026/08/20")) {
          return new Response(JSON.stringify({ messages: [{ text: "hello hello emote_time", username: "viewer", timestamp: "2026-08-20T00:00:00.000Z" }] }), { status: 200 });
        }
        return new Response("rate limited", { status: 429 });
      })
    );
    const built = await buildChatArchive(
      "testchannel",
      seData,
      () => {},
      () => false
    );
    expect(built.source).toBe("zonian");
    expect(built.ingestedDays).toEqual(["2026-08-20"]);
    expect(built.partialOffsets).toEqual({ "2026-08-19": 0 });
    expect(built.dayOffsets).toEqual({ "2026-08-20": 1, "2026-08-19": 0 });
    expect(built.messages).toBe(1);
  });
});

describe("archive cache validation", () => {
  const data = {
    chatters: [{ login: "viewer_a", displayName: "ViewerA", messages: 1 }],
  } as DynamicStreamerData;

  const archive: CachedArchive = {
    channel: "example_channel",
    builtAt: Date.now(),
    source: "vods",
    videos: 1,
    days: 0,
    messages: 1,
    data,
  };

  it("rejects empty cached archives instead of presenting them as deep archives", () => {
    expect(isUsableArchive(archive)).toBe(true);
    expect(isUsableArchive({ ...archive, messages: 0 })).toBe(false);
    expect(isUsableArchive({ ...archive, data: { ...data, chatters: [] } })).toBe(false);
  });
});

describe("aggregate serialization (incremental sync)", () => {
  const serialized: SerializedAggregate = {
    version: 1,
    totalMessages: 10,
    minDate: "2026-08",
    maxDate: "2026-08-19",
    targets: {
      "7tv:FeelsDankMan": {
        kind: "7tv",
        kindLabel: "7TV Emote",
        name: "FeelsDankMan",
        total: 5,
        users: ["viewer_a", "viewer_b"],
        url: "https://cdn.7tv.app/emote/abc/2x.webp",
        perChatter: { viewer_a: 3, viewer_b: 2 },
      },
      "word:hello": {
        kind: "word",
        kindLabel: "Word",
        name: "hello",
        total: 2,
        users: ["viewer_a"],
        url: null,
        perChatter: { viewer_a: 2 },
      },
    },
    chatters: {
      viewer_a: {
        login: "viewer_a",
        displayName: "ViewerA",
        messages: 6,
        targets: { "7tv:FeelsDankMan": 3, "word:hello": 2 },
        timeline: { "2026-08": 6 },
        firstSeen: "2026-08-10T00:00:00.000Z",
        lastSeen: "2026-08-19T00:00:00.000Z",
      },
      viewer_b: {
        login: "viewer_b",
        displayName: "ViewerB",
        messages: 4,
        targets: { "7tv:FeelsDankMan": 2 },
        timeline: { "2026-08": 4 },
        firstSeen: "2026-08-11T00:00:00.000Z",
        lastSeen: "2026-08-12T00:00:00.000Z",
      },
    },
    longest: [
      {
        login: "viewer_a",
        displayName: "ViewerA",
        text: "this is a very long message that qualifies as a longest candidate",
        length: 68,
        words: 11,
        ts: "2026-08-19T00:00:00.000Z",
      },
    ],
  };

  it("round-trips an aggregate losslessly (serialize -> deserialize -> serialize)", () => {
    const agg = deserializeAggregate(serialized);
    expect(serializeAggregate(agg)).toEqual(serialized);
  });

  it("caps the longest-message candidates at 200 so the top 100 stays exact", () => {
    const many = {
      ...serialized,
      longest: Array.from({ length: 500 }, (_, i) => ({
        login: "viewer_a",
        displayName: "ViewerA",
        text: `message ${i}`,
        length: 30 + i,
        words: 5,
        ts: "2026-08-19T00:00:00.000Z",
      })),
    };
    const agg = deserializeAggregate(many);
    expect(agg.longest).toHaveLength(500);
    const again = serializeAggregate(agg);
    expect(again.longest).toHaveLength(200);
    expect(again.longest[0].length).toBe(529);
  });
});

describe("incremental sync re-checks the live day's growing tail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setZonianRetryConfig({ maxAttempts: 8, baseDelayMs: 500 });
  });

  const seData = {
    channel: "testchannel",
    twitchId: "123456789",
    avatarUrl: "https://example.com/avatar.png",
    emotesCount: 0,
    targets: [],
    questions: [],
    higherLowerItems: [],
    chatters: [],
    feudCategories: [],
    longestMessages: [],
    chatterLoreMatchups: [],
    chatterProfiles: {},
    stats: { chatters: 0, messages: 0, targets: 0 },
    streamelements: { stats: { messages: 0, chatters: 0, emotes: 0, commands: 0 }, chatters: [], emotes: { "7tv": [], twitch: [], bttv: [], ffz: [] }, commands: [] },
    leaderboards: {},
    loadedAt: Date.now(),
  } as DynamicStreamerData;

  const message = (n: number, day: "19" | "20") => ({
    text: `live ${n}`,
    username: "viewer",
    timestamp: `2026-08-${day}T00:00:${String(n).padStart(2, "0")}.000Z`,
  });

  // Build a cached archive from two days: 08-19 (past, immutable) and
  // 08-20 (the live day, 3 messages at build time).
  const buildCached = async (): Promise<CachedArchive> => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/list?channel=")) {
          return new Response(JSON.stringify({ availableLogs: [{ year: "2026", month: "8", day: "20" }, { year: "2026", month: "8", day: "19" }] }), { status: 200 });
        }
        if (url.includes("2026/08/20")) {
          const offset = Number(new URL(url).searchParams.get("offset"));
          const tail = [1, 2, 3].map((n) => message(n, "20")).slice(offset);
          return new Response(JSON.stringify({ messages: tail }), { status: 200 });
        }
        return new Response(JSON.stringify({ messages: [message(1, "19")] }), { status: 200 });
      })
    );
    return buildChatArchive("testchannel", seData, () => {}, () => false);
  };

  it("re-fetches only the live day's tail and never double-counts merged messages", async () => {
    const cached = await buildCached();
    expect(cached.ingestedDays).toEqual(["2026-08-19", "2026-08-20"]);
    expect(cached.dayOffsets).toEqual({ "2026-08-19": 1, "2026-08-20": 3 });
    expect(cached.messages).toBe(4);

    // The live day grew to 5 messages; the 3 already merged must NOT be re-read.
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/list?channel=")) {
          return new Response(JSON.stringify({ availableLogs: [{ year: "2026", month: "8", day: "20" }, { year: "2026", month: "8", day: "19" }] }), { status: 200 });
        }
        if (url.includes("2026/08/20")) {
          const offset = Number(new URL(url).searchParams.get("offset"));
          const tail = [1, 2, 3, 4, 5].map((n) => message(n, "20")).slice(offset);
          return new Response(JSON.stringify({ messages: tail }), { status: 200 });
        }
        return new Response(JSON.stringify({ messages: [message(1, "19")] }), { status: 200 });
      })
    );
    const updated = await incrementalArchiveUpdate("testchannel", cached, seData, () => {}, () => false);
    expect(updated).not.toBeNull();
    expect(updated!.messages).toBe(6);
    expect(updated!.ingestedDays).toEqual(["2026-08-19", "2026-08-20"]);
    expect(updated!.dayOffsets).toEqual({ "2026-08-19": 1, "2026-08-20": 5 });
  });

  it("returns null when the live day has not grown (nothing new to fetch)", async () => {
    const cached = await buildCached();
    const updated = await incrementalArchiveUpdate("testchannel", cached, seData, () => {}, () => false);
    expect(updated).toBeNull();
  });

  it("returns null when a fully-ingested live day has no recorded offset (can't resume safely)", async () => {
    const cached = await buildCached();
    const noOffsets = { ...cached, dayOffsets: undefined };
    const updated = await incrementalArchiveUpdate("testchannel", noOffsets, seData, () => {}, () => false);
    expect(updated).toBeNull();
  });
});
