import { describe, it, expect } from "vitest";
import { getRandomPrompt, SOLO_CRIMES, DUO_PROMPTS } from "../lib/qtePrompts";
import { qteAudio } from "../lib/qteAudio";
import { buildQteChatterPool } from "../lib/qteChatters";

describe("QTE System Prompts & Logic", () => {
  it("generates default pure timeout defense prompts when flavor crimes are off", () => {
    const solo = getRandomPrompt("solo_trial", false);
    expect(solo.mode).toBe("solo_trial");
    expect(solo.crimeOrTopic).toBe("Why should you not be timed out?");

    const duo = getRandomPrompt("duo_duel", false);
    expect(duo.mode).toBe("duo_duel");
    expect(duo.crimeOrTopic).toBe("Why should the OTHER person be timed out?");
  });

  it("generates valid scenario flavor prompts when enabled", () => {
    const soloFlavor = getRandomPrompt("solo_trial", true);
    expect(soloFlavor.mode).toBe("solo_trial");
    expect(SOLO_CRIMES.some((c) => c.title === soloFlavor.title)).toBe(true);

    const duoFlavor = getRandomPrompt("duo_duel", true);
    expect(duoFlavor.mode).toBe("duo_duel");
    expect(DUO_PROMPTS.some((p) => p.title === duoFlavor.title)).toBe(true);
  });

  it("audio controller handles missing window gracefully", () => {
    expect(() => qteAudio.playSiren()).not.toThrow();
    expect(() => qteAudio.playTick()).not.toThrow();
    expect(() => qteAudio.playReadyFight()).not.toThrow();
    expect(() => qteAudio.playCountdownTick(5)).not.toThrow();
    expect(() => qteAudio.playBanHammer()).not.toThrow();
    expect(() => qteAudio.playVictoryFanfare()).not.toThrow();
  });
});

describe("QTE chatter pool (live chat drafting)", () => {
  const now = Date.now();
  const msg = (username: string, displayName = username, ts = now) => ({
    username,
    displayName,
    timestamp: ts,
  });

  it("never drafts StreamElements, Nightbot, or other known bots", () => {
    const pool = buildQteChatterPool(
      [
        msg("streamelements", "StreamElements"),
        msg("nightbot", "Nightbot"),
        msg("streamlabs"),
        msg("RealViewer"),
        msg("AnotherViewer"),
      ],
      now,
      5 * 60 * 1000
    );
    const logins = pool.map((p) => p.username.toLowerCase());
    expect(logins).not.toContain("streamelements");
    expect(logins).not.toContain("nightbot");
    expect(logins).not.toContain("streamlabs");
    expect(logins).toContain("realviewer");
    expect(logins).toContain("anotherviewer");
  });

  it("dedupes by username and only keeps messages inside the activity window", () => {
    const old = now - 10 * 60 * 1000;
    const pool = buildQteChatterPool(
      [
        msg("viewer_a", "ViewerA"),
        msg("viewer_a", "ViewerA"), // dup
        msg("viewer_b", "ViewerB", old), // stale -> dropped
        msg("viewer_c", "ViewerC"),
      ],
      now,
      5 * 60 * 1000
    );
    const logins = pool.map((p) => p.username).sort();
    expect(logins).toEqual(["viewer_a", "viewer_c"]);
  });
});
