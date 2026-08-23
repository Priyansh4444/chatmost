import { test, expect } from "@playwright/test";
import {
  testChannels,
  readFixture,
  seedArchive,
  loadChannelReady,
  readArchiveStore,
  heroBarEmoteCount,
  exploreEmoteCount,
  DB_NAME,
  DB_STORE,
  CACHE_VERSION,
} from "./helpers";

for (const channel of testChannels()) {
  test.describe(`emote count correctness — #${channel}`, () => {
    test("hero bar + Lexicon counts equal the cached archive's distinct emote targets", async ({ page }) => {
      const fixture = readFixture(channel);
      await seedArchive(page, channel);
      await loadChannelReady(page, channel);

      // The archive behind the scenes
      const store = await readArchiveStore(page);
      const cacheEmotes = store[`${channel}::${CACHE_VERSION}`]?.data?.emotesCount;
      expect(cacheEmotes).toBeDefined();
      expect(cacheEmotes).toBe(fixture.data.emotesCount);

      // The two archive-derived displays must both agree with the cache
      expect(await heroBarEmoteCount(page)).toBe(fixture.data.emotesCount);
      expect(await exploreEmoteCount(page)).toBe(fixture.data.emotesCount);

      // Sanity: a real full archive never reports an empty/SE-snapshot count
      expect(fixture.data.emotesCount).toBeGreaterThan(50);
    });

    test("the archive emote count is NOT the StreamElements snapshot count", async ({ page }) => {
      const fixture = readFixture(channel);
      const seEmotes = fixture.data.streamelements?.stats?.emotes ?? 0;
      // SE chatstats only track the SE widget's own emotes, so the archive
      // count must be strictly larger — otherwise the hero bar was showing the
      // SE snapshot and misleadingly reporting it as the channel's emotes.
      expect(fixture.data.emotesCount).toBeGreaterThan(seEmotes);
    });
  });
}

test.describe("emote count fixture sanity", () => {
  test("fixtures exist for every configured channel", () => {
    for (const channel of testChannels()) {
      const fixture = readFixture(channel);
      expect(fixture.channel).toBe(channel);
      expect(fixture.messages).toBeGreaterThan(0);
      expect(fixture.data.emotesCount).toBeGreaterThan(0);
    }
  });
});