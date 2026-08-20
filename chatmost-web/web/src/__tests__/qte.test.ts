import { describe, it, expect } from "vitest";
import { getRandomPrompt, SOLO_CRIMES, DUO_PROMPTS } from "../lib/qtePrompts";
import { qteAudio } from "../lib/qteAudio";

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
