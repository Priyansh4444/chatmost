import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getQuestion = query({
  args: {
    tier: v.optional(v.number()), // 1 to 15
    kind: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tier = args.tier ?? 1;
    let targets = [];
    if (tier <= 4) {
      targets = await ctx.db
        .query("targets")
        .filter((q) => q.eq(q.field("isBrainrot"), true))
        .take(30);
    }
    if (targets.length === 0) {
      targets = await ctx.db
        .query("targets")
        .order("desc")
        .take(50);
    }
    if (targets.length === 0) return null;

    const target = targets[Math.floor(Math.random() * targets.length)];

    const topCounts = await ctx.db
      .query("counts")
      .withIndex("by_target", (q) =>
        q.eq("kind", target.kind).eq("name", target.name)
      )
      .order("desc")
      .take(15);

    if (topCounts.length === 0) return null;

    const answer = {
      login: topCounts[0].login,
      displayName: topCounts[0].displayName,
    };

    const randomChatters = await ctx.db
      .query("chatters")
      .order("desc")
      .take(50);

    const decoys = randomChatters
      .filter((c) => c.login !== answer.login)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((c) => ({ login: c.login, displayName: c.displayName }));

    const choices = [answer, ...decoys].sort(() => Math.random() - 0.5);

    return {
      target: {
        kind: target.kind,
        kindLabel: target.kind === "7tv" ? "7TV Emote" : target.kind === "twitch" ? "Twitch Emote" : "Word",
        name: target.name,
        url: target.url ?? null,
        totalUses: target.total,
        isBrainrot: !!target.isBrainrot,
      },
      tier,
      answer,
      choices,
      leaderboard: topCounts.map((r) => ({
        login: r.login,
        displayName: r.displayName,
        count: r.n,
      })),
    };
  },
});

export const getStats = query({
  handler: async (ctx) => {
    const topChatters = await ctx.db
      .query("chatters")
      .withIndex("by_messages")
      .order("desc")
      .take(25);

    const topEmotes = await ctx.db
      .query("targets")
      .filter((q) =>
        q.or(q.eq(q.field("kind"), "7tv"), q.eq(q.field("kind"), "twitch"))
      )
      .order("desc")
      .take(25);

    return {
      chatters: 2177,
      messages: 588210,
      targets: 14106,
      topChatters: topChatters.map((c) => ({
        login: c.login,
        displayName: c.displayName,
        messages: c.messages,
      })),
      topEmotes: topEmotes.map((e) => ({
        kind: e.kind,
        name: e.name,
        total: e.total,
        url: e.url ?? null,
      })),
      topBrainrot: [],
    };
  },
});

export const getChatterProfile = query({
  args: {
    login: v.string(),
  },
  handler: async (ctx, args) => {
    const chatter = await ctx.db
      .query("chatters")
      .withIndex("by_login", (q) => q.eq("login", args.login))
      .first();

    if (!chatter) return null;

    const topCounts = await ctx.db
      .query("counts")
      .withIndex("by_chatter", (q) => q.eq("login", args.login))
      .order("desc")
      .take(20);

    return {
      login: chatter.login,
      displayName: chatter.displayName,
      messages: chatter.messages,
      topTargets: topCounts.map((cnt) => ({
        kind: cnt.kind,
        name: cnt.name,
        count: cnt.n,
      })),
    };
  },
});

export const submitFeudScore = mutation({
  args: {
    playerName: v.string(),
    score: v.number(),
    strikes: v.number(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("feudScores", {
      ...args,
      completedAt: Date.now(),
    });
  },
});
