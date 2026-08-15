import { mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed mutation to batch insert chatters, targets, and counts into Convex
 */
export const seedBatch = mutation({
  args: {
    chatters: v.optional(
      v.array(
        v.object({
          login: v.string(),
          displayName: v.string(),
          messages: v.number(),
        })
      )
    ),
    targets: v.optional(
      v.array(
        v.object({
          kind: v.string(),
          name: v.string(),
          total: v.number(),
          users: v.number(),
          url: v.optional(v.string()),
          isBrainrot: v.optional(v.boolean()),
        })
      )
    ),
    counts: v.optional(
      v.array(
        v.object({
          kind: v.string(),
          name: v.string(),
          login: v.string(),
          displayName: v.string(),
          n: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    let insertedChatters = 0;
    let insertedTargets = 0;
    let insertedCounts = 0;

    if (args.chatters) {
      for (const c of args.chatters) {
        await ctx.db.insert("chatters", c);
        insertedChatters++;
      }
    }

    if (args.targets) {
      for (const t of args.targets) {
        await ctx.db.insert("targets", t);
        insertedTargets++;
      }
    }

    if (args.counts) {
      for (const cnt of args.counts) {
        await ctx.db.insert("counts", cnt);
        insertedCounts++;
      }
    }

    return {
      insertedChatters,
      insertedTargets,
      insertedCounts,
    };
  },
});
