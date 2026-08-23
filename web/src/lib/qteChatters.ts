import type { QTEParticipant } from "./qteTypes";
import { isBot } from "./utils";

/**
 * Build the active QTE chatter pool from a live message buffer, deduped by
 * username and filtered to exclude known bot accounts (StreamElements,
 * Nightbot, Streamlabs, etc.). Bots must never be drafted into a QTE — they
 * cannot defend themselves in chat.
 */
export function buildQteChatterPool(
  messages: { username: string; displayName?: string; color?: string; timestamp: number }[],
  now: number,
  windowMs: number
): QTEParticipant[] {
  const cutoff = now - windowMs;
  const seen = new Map<string, QTEParticipant>();

  for (const msg of messages) {
    if (msg.timestamp < cutoff) continue;
    if (isBot(msg.username)) continue;
    const key = msg.username.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, {
        username: msg.username,
        displayName: msg.displayName || msg.username,
        color: msg.color || "#a855f7",
        votes: 0,
      });
    }
  }

  return Array.from(seen.values());
}