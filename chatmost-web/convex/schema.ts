import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  chatters: defineTable({
    login: v.string(),
    displayName: v.string(),
    messages: v.number(),
  })
    .index("by_login", ["login"])
    .index("by_messages", ["messages"]),

  targets: defineTable({
    kind: v.string(), // "word" | "twitch" | "7tv"
    name: v.string(),
    total: v.number(),
    users: v.number(),
    url: v.optional(v.string()),
    isBrainrot: v.optional(v.boolean()),
  })
    .index("by_kind_total", ["kind", "total"])
    .index("by_name", ["name"]),

  counts: defineTable({
    kind: v.string(),
    name: v.string(),
    login: v.string(),
    displayName: v.string(),
    n: v.number(),
  })
    .index("by_target", ["kind", "name", "n"])
    .index("by_chatter", ["login"]),

  // Multiplayer live rooms
  rooms: defineTable({
    code: v.string(),
    hostName: v.string(),
    currentTier: v.number(),
    currentTarget: v.optional(
      v.object({
        kind: v.string(),
        name: v.string(),
        url: v.optional(v.string()),
        totalUses: v.number(),
      })
    ),
    activeChoices: v.array(
      v.object({
        login: v.string(),
        displayName: v.string(),
      })
    ),
    answerLogin: v.string(),
    status: v.string(), // "lobby" | "question" | "answered" | "gameover" | "victory"
    votes: v.array(
      v.object({
        voter: v.string(),
        choiceLogin: v.string(),
        timestamp: v.number(),
      })
    ),
    createdAt: v.number(),
  }).index("by_code", ["code"]),

  // Feud leaderboard scores
  feudScores: defineTable({
    playerName: v.string(),
    score: v.number(),
    strikes: v.number(),
    category: v.string(),
    completedAt: v.number(),
  }).index("by_score", ["score"]),
});
