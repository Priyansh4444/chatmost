import { describe, it, expect } from "vitest";
import { pickNextChatter, pickNextEmote, pickNextMatchup, pickPrioritizedMatchup } from "../pages/HigherLower";
import { buildMatchups, type MatchupItem } from "../pages/higherLowerUtils";
import { api, type Question, type ChatterLoreMatchup } from "../lib/api";
import type { DynamicStreamerData } from "../lib/dynamicStreamer";

describe("Hard & Close Matchmaking Algorithms", () => {
  const sampleChatters = [
    { login: "viewer_1", displayName: "Viewer1", messages: 41798, rank: 1 },
    { login: "viewer_2", displayName: "Viewer2", messages: 40096, rank: 2 },
    { login: "viewer_3", displayName: "Viewer3", messages: 24624, rank: 3 },
    { login: "viewer_4", displayName: "Viewer4", messages: 22625, rank: 4 },
    { login: "viewer_5", displayName: "Viewer5", messages: 22393, rank: 5 },
    { login: "viewer_6", displayName: "Viewer6", messages: 18450, rank: 6 },
    { login: "viewer_7", displayName: "Viewer7", messages: 16200, rank: 7 },
    { login: "viewer_8", displayName: "Viewer8", messages: 14100, rank: 8 },
  ];

  it("picks close chatter candidates within tight margins and never duplicates current candidate", () => {
    const current = sampleChatters[2];
    for (let i = 0; i < 20; i++) {
      const next = pickNextChatter(current, sampleChatters, i);
      expect(next.login).not.toBe(current.login);
      expect(next.messages).toBeGreaterThan(0);
    }
  });

  const sampleEmotes = [
    { kind: "7tv" as const, kindLabel: "7TV", name: "EMOTE_A", total: 21025, users: 186, url: null, rank: 1 },
    { kind: "twitch" as const, kindLabel: "Twitch", name: "EMOTE_B", total: 18420, users: 154, url: null, rank: 2 },
    { kind: "7tv" as const, kindLabel: "7TV", name: "EMOTE_C", total: 15900, users: 142, url: null, rank: 3 },
    { kind: "7tv" as const, kindLabel: "7TV", name: "EMOTE_D", total: 13200, users: 130, url: null, rank: 4 },
    { kind: "7tv" as const, kindLabel: "7TV", name: "EMOTE_E", total: 11100, users: 120, url: null, rank: 5 },
    { kind: "7tv" as const, kindLabel: "7TV", name: "EMOTE_F", total: 9800, users: 110, url: null, rank: 6 },
  ];

  it("picks close emote candidates without repeating reference emote", () => {
    const current = sampleEmotes[1];
    for (let i = 0; i < 20; i++) {
      const next = pickNextEmote(current, sampleEmotes, i);
      expect(next.name).not.toBe(current.name);
      expect(next.total).toBeGreaterThan(0);
    }
  });

  const sampleMatchups = [
    { rank: 1, login: "viewer_1", displayName: "Viewer1", targetKind: "7tv" as const, targetName: "EMOTE_A", targetUrl: null, count: 3394 },
    { rank: 2, login: "viewer_2", displayName: "Viewer2", targetKind: "7tv" as const, targetName: "EMOTE_B", targetUrl: null, count: 2502 },
    { rank: 3, login: "viewer_1", displayName: "Viewer1", targetKind: "7tv" as const, targetName: "EMOTE_B", targetUrl: null, count: 2265 },
    { rank: 4, login: "viewer_3", displayName: "Viewer3", targetKind: "7tv" as const, targetName: "EMOTE_B", targetUrl: null, count: 1376 },
    { rank: 5, login: "viewer_3", displayName: "Viewer3", targetKind: "twitch" as const, targetName: "EMOTE_C", targetUrl: null, count: 1081 },
    { rank: 6, login: "viewer_4", displayName: "Viewer4", targetKind: "7tv" as const, targetName: "EMOTE_D", targetUrl: null, count: 850 },
  ];

  it("picks competitive chatter lore matchups without self-pairing", () => {
    const current = sampleMatchups[1];
    for (let i = 0; i < 20; i++) {
      const next = pickNextMatchup(current, sampleMatchups, i);
      expect(`${next.login}:${next.targetName}`).not.toBe(`${current.login}:${current.targetName}`);
      expect(next.count).toBeGreaterThan(0);
    }
  });

  it("prefers a close 7TV/Twitch emote over an equally-close word for the next matchup", () => {
    const current: MatchupItem = { rank: 1, login: "viewer_1", displayName: "Viewer1", targetKind: "7tv", targetName: "EMOTE_A", targetUrl: null, count: 100 };
    const pool: MatchupItem[] = [
      current,
      { rank: 2, login: "viewer_2", displayName: "Viewer2", targetKind: "7tv", targetName: "EMOTE_B", targetUrl: null, count: 150 },
      { rank: 3, login: "viewer_3", displayName: "Viewer3", targetKind: "word", targetName: "substantial", targetUrl: null, count: 120 },
      { rank: 4, login: "viewer_4", displayName: "Viewer4", targetKind: "7tv", targetName: "EMOTE_C", targetUrl: null, count: 500 },
    ];
    for (let i = 0; i < 20; i++) {
      const next = pickNextMatchup(current, pool, i);
      expect(next.targetName).toBe("EMOTE_B");
    }
  });

  it("buildMatchups keeps emotes and drops words shorter than 7 chars when the pool is large", () => {
    const items: ChatterLoreMatchup[] = [];
    for (let i = 0; i < 35; i++) {
      items.push(makeMatchup(i, "7tv", `EMOTE_${i}`));
    }
    items.push(makeMatchup(100, "word", "lengthyword"));
    items.push(makeMatchup(101, "word", "anotherlong"));
    items.push(makeMatchup(102, "word", "shorty")); // 6 chars → dropped
    const built = buildMatchups(items);
    expect(built.length).toBe(37); // 35 emotes + 2 long words, no short word
    for (const m of built) {
      if (m.targetKind === "word") expect(m.targetName.length).toBeGreaterThanOrEqual(7);
    }
  });

  it("buildMatchups falls back to 5+ char words on sparse channels so the mode stays playable", () => {
    const items: ChatterLoreMatchup[] = [
      makeMatchup(0, "7tv", "EMOTE_A"),
      makeMatchup(1, "7tv", "EMOTE_B"),
      makeMatchup(2, "7tv", "EMOTE_C"),
      makeMatchup(3, "7tv", "EMOTE_D"),
      makeMatchup(4, "7tv", "EMOTE_E"),
      makeMatchup(5, "word", "longwordseven"),
      makeMatchup(6, "word", "goodenough"),
      makeMatchup(7, "word", "shorter"),
      makeMatchup(8, "word", "words"),
    ];
    const built = buildMatchups(items);
    expect(built.length).toBeGreaterThanOrEqual(9); // fallback pulled the 5-6 char words back in
    const wordTargets = built.filter((m) => m.targetKind === "word").map((m) => m.targetName);
    expect(wordTargets).toContain("shorter");
    expect(wordTargets).toContain("words");
  });

  it("pickPrioritizedMatchup randomizes the opening card and leans on emotes", () => {
    const pool: MatchupItem[] = [
      ...Array.from({ length: 30 }, (_, i) => makeMatchup(i, "7tv", `EMOTE_${i}`)),
      ...Array.from({ length: 30 }, (_, i) => makeMatchup(100 + i, "word", `longword${i}`)),
    ];
    let emotes = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const pick = pickPrioritizedMatchup(pool);
      if (!pick) continue;
      if (pick.targetKind === "7tv" || pick.targetKind === "twitch") emotes++;
      seen.add(pick.targetName);
    }
    expect(emotes / 200).toBeGreaterThan(0.55); // emote-biased
    expect(seen.size).toBeGreaterThan(1); // varies across runs
  });

  it("samples unweighted random chatters in ranks 1 to 150 sorted so higher tiers have better chatters", () => {
    const roster = api.getRandomTop150Chatters(8, {
      ...emptyDynamic(),
      chatters: sampleChatters,
    });
    expect(roster.length).toBe(8);

    const logins = new Set<string>();
    for (let i = 0; i < roster.length; i++) {
      const chatter = roster[i];
      expect(chatter.rank).toBeGreaterThanOrEqual(1);
      expect(chatter.rank).toBeLessThanOrEqual(150);
      expect(logins.has(chatter.login)).toBe(false);
      logins.add(chatter.login);

      if (i > 0) {
        // Higher index in roster (higher tier) has better rank (lower rank number)
        expect(roster[i].rank).toBeLessThanOrEqual(roster[i - 1].rank);
      }
    }
  });

  it("generates unweighted question with 4 choices and valid answer in top 1-150 range", async () => {
    const q = await api.question(archiveFromQuestions(makeQuestions(15)));
    expect(q.choices.length).toBe(4);
    expect(q.choices.some((c) => c.login === q.answer.login)).toBe(true);
    expect(q.target.name).toBeDefined();
    expect(q.target.totalUses).toBeGreaterThan(0);
  });

  it("filters out StreamElements and known bots from chatters, questions, and rosters", async () => {
    const chattersWithBots = [
      { login: "streamelements", displayName: "StreamElements", messages: 99999, rank: 1 },
      { login: "nightbot", displayName: "Nightbot", messages: 88888, rank: 2 },
      { login: "real_viewer", displayName: "RealViewer", messages: 12000, rank: 3 },
    ];
    const qs = makeQuestions(2);
    qs[0].choices.push({ login: "streamelements", displayName: "StreamElements" });
    qs[0].leaderboard.unshift({ login: "streamelements", displayName: "StreamElements", count: 9999 });

    const dynamic = {
      ...archiveFromQuestions(qs),
      chatters: [...archiveFromQuestions(qs).chatters, ...chattersWithBots],
    };

    const top = api.topChatters(10, dynamic);
    expect(top.some((c) => c.login === "streamelements")).toBe(false);
    expect(top.some((c) => c.login === "nightbot")).toBe(false);
    expect(top.some((c) => c.login === "real_viewer")).toBe(true);

    const roster = api.getRandomTop150Chatters(5, dynamic);
    expect(roster.some((c) => c.login === "streamelements")).toBe(false);

    const q = await api.question({ ...dynamic, ...archiveFromQuestions(qs) });
    expect(q.choices.some((c) => c.login === "streamelements")).toBe(false);
    expect(q.leaderboard.some((e) => e.login === "streamelements")).toBe(false);
  });
});

function makeMatchup(rank: number, targetKind: "7tv" | "twitch" | "word", targetName: string): ChatterLoreMatchup {
  return {
    rank,
    login: `viewer_${rank}`,
    displayName: `Viewer${rank}`,
    targetKind,
    targetName,
    targetUrl: null,
    count: 100 + rank * 13,
    metric: "uses",
  };
}

function makeQuestions(n: number): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    tier: i + 1,
    prize: `T${i + 1}`,
    target: {
      kind: "7tv" as const,
      kindLabel: "7TV Emote",
      name: `EMOTE_${i + 1}`,
      url: "https://cdn.7tv.app/emote/x/2x.webp",
      totalUses: 1000 - i * 50,
    },
    answer: { login: `user${i}`, displayName: `user${i}` },
    choices: [
      { login: `user${i}`, displayName: `user${i}` },
      { login: "decoy_a", displayName: "decoy_a" },
      { login: "decoy_b", displayName: "decoy_b" },
      { login: "decoy_c", displayName: "decoy_c" },
    ],
    leaderboard: [
      { login: `user${i}`, displayName: `user${i}`, count: 100 },
      { login: "decoy_a", displayName: "decoy_a", count: 50 },
      { login: "decoy_b", displayName: "decoy_b", count: 40 },
    ],
  }));
}

function makeWordQuestions(n: number): Question[] {
  return makeQuestions(n).map((q, i) => ({
    ...q,
    target: { kind: "word" as const, kindLabel: "Word", name: `longerword${i + 1}`, url: null, totalUses: 1000 - i * 50 },
  }));
}

function emptyDynamic(): DynamicStreamerData {
  return {
    channel: "test",
    twitchId: "1",
    emotesCount: 0,
    targets: [],
    questions: [],
    higherLowerItems: [],
    chatters: [],
    feudCategories: [],
    longestMessages: [],
    chatterLoreMatchups: [],
    chatterProfiles: {},
    stats: {
      chatters: 0,
      messages: 0,
      targets: 0,
      dateRange: "",
      topChatters: [],
      topEmotes: [],
      rarestEmotes: [],
    },
    streamelements: {
      stats: { messages: 0, chatters: 0, emotes: 0, commands: 0 },
      chatters: [],
      emotes: { "7tv": [], twitch: [], bttv: [], ffz: [] },
      commands: [],
    },
    leaderboards: {},
    loadedAt: 0,
  };
}

function archiveFromQuestions(questions: Question[]): DynamicStreamerData {
  const chattersByLogin = new Map<string, { login: string; displayName: string }>();
  const leaderboards: DynamicStreamerData["leaderboards"] = {};
  const targets = questions.map((q) => {
    for (const choice of q.choices) chattersByLogin.set(choice.login, choice);
    for (const row of q.leaderboard) chattersByLogin.set(row.login, { login: row.login, displayName: row.displayName });
    leaderboards[`${q.target.kind}:${q.target.name}`] =
      q.leaderboard.length > 0
        ? q.leaderboard
        : q.choices.map((c, i) => ({ login: c.login, displayName: c.displayName, count: 100 - i }));
    return {
      kind: q.target.kind,
      kindLabel: q.target.kindLabel,
      name: q.target.name,
      total: q.target.totalUses,
      url: q.target.url,
    };
  });
  return {
    ...emptyDynamic(),
    targets,
    chatters: [...chattersByLogin.values()],
    leaderboards,
  };
}

describe("Save-Your-Chatters live archive trivia", () => {
  const questions = makeWordQuestions(15);
  const archive = archiveFromQuestions(questions);

  it("varies the target across a 15-stage run without excludes", () => {
    const originalRandom = Math.random;
    let seed = 10;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    try {
      const used: string[] = [];
      for (let tier = 1; tier <= 15; tier++) {
        const q = api.question(archive, "words");
        used.push(q.target.name);
      }
      expect(new Set(used).size).toBeGreaterThan(1);
    } finally {
      Math.random = originalRandom;
    }
  });

  it("does not always serve the first archive target", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const q = await api.question(archiveFromQuestions(makeQuestions(15)));
      seen.add(q.target.name);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("still builds stage 2 after the first target was bye", async () => {
    const qs = makeQuestions(8);
    qs[0] = { ...qs[0], target: { ...qs[0].target, name: "bye" } };
    const data = archiveFromQuestions(qs);
    const first = api.question(data);
    const second = api.question(data);
    expect(first.target.name).toBeDefined();
    expect(second.target.name).toBeDefined();
    expect(second.choices.length).toBe(4);
  });

  it("skips short words and stop words in words scope", async () => {
    const qs = makeWordQuestions(3);
    qs[0] = { ...qs[0], target: { ...qs[0].target, name: "get" } };
    qs[1] = { ...qs[1], target: { ...qs[1].target, name: "here" } };
    const q = await api.question(archiveFromQuestions(qs), "words");
    expect(q.target.name).not.toBe("get");
    expect(q.target.name).not.toBe("here");
    expect(q.target.name.length).toBeGreaterThanOrEqual(5);
  });

  it("throws when the archive has no trivia targets", async () => {
    expect(() => api.question(emptyDynamic())).toThrow(/live chatter data/);
  });

  it("skips targets used by fewer than 3 chatters", () => {
    const qs = makeQuestions(2);
    qs[0] = {
      ...qs[0],
      target: { ...qs[0].target, name: "kiawalooking" },
      leaderboard: [{ login: "splinteredspike", displayName: "splinteredspike", count: 1 }],
    };
    const q = api.question(archiveFromQuestions(qs));
    expect(q.target.name).not.toBe("kiawalooking");
    expect(q.choices.length).toBe(4);
  });

  it("throws when every target has fewer than 3 chatters", () => {
    const qs = makeQuestions(2).map((q) => ({
      ...q,
      leaderboard: [{ login: "splinteredspike", displayName: "splinteredspike", count: 1 }],
    }));
    expect(() => api.question(archiveFromQuestions(qs))).toThrow(/live chatter data/);
  });
});

describe("Millionaire trivia scopes (emotes-only default, words opt-in)", () => {
  it("serves ONLY 7TV/Twitch emotes by default", async () => {
    const mixed = [...makeQuestions(8), ...makeWordQuestions(8)];
    const q = await api.question(archiveFromQuestions(mixed));
    expect(q.target.kind).toBe("7tv");
  });

  it("throws by default when the archive has only word targets (words are opt-in)", async () => {
    expect(() => api.question(archiveFromQuestions(makeWordQuestions(3)))).toThrow(/live chatter data/);
  });

  it("serves ONLY word questions when scope is 'words'", async () => {
    const q = await api.question(archiveFromQuestions(makeWordQuestions(15)), "words");
    expect(q.target.kind).toBe("word");
  });
});
