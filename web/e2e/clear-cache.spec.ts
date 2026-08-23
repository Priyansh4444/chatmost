import { test, expect } from "@playwright/test";
import {
  testChannels,
  readFixture,
  seedArchive,
  loadChannelReady,
  readArchiveStore,
  heroBarEmoteCount,
  DB_NAME,
  DB_STORE,
  CACHE_VERSION,
} from "./helpers";

for (const channel of testChannels()) {
  test.describe(`clear cache button — #${channel}`, () => {
    test("double-click clears the IndexedDB archive store and rebuilds from scratch", async ({ page }) => {
      const fixture = readFixture(channel);
      await seedArchive(page, channel);
      await loadChannelReady(page, channel);

      // 1. Archive is seeded and displayed
      const before = await readArchiveStore(page);
      const key = `${channel}::${CACHE_VERSION}`;
      expect(before[key]).toBeDefined();
      const beforeBuiltAt = before[key].builtAt;
      const beforeEmotes = await heroBarEmoteCount(page);
      expect(beforeEmotes).toBe(fixture.data.emotesCount);

      // 2. First click only arms the confirm state (no clear yet)
      await page.locator("button", { hasText: "Clear Cache" }).first().click();
      const confirmButton = page.locator("button", { hasText: "Click again to confirm" }).first();
      await expect(confirmButton).toBeVisible();

      // 3. Second click actually wipes the archive store
      await confirmButton.click();
      await expect
        .poll(async () => Object.keys(await readArchiveStore(page)).length, {
          timeout: 15_000,
          message: "IndexedDB archive store should be emptied after Clear Cache",
        })
        .toBe(0);

      // 4. The blocking rebuild overlay appears
      await expect(page.locator("text=Building chat archive").first()).toBeVisible({ timeout: 15_000 });

      // 5. The rebuild completes (real, from scratch) and lands back on Deep Archive
      await expect(page.locator("text=Deep Archive").first()).toBeVisible({ timeout: 20 * 60 * 1000 });

      // 6. A fresh archive entry exists with a newer builtAt
      const after = await readArchiveStore(page);
      expect(after[key]).toBeDefined();
      expect(after[key].builtAt).toBeGreaterThan(beforeBuiltAt);

      // 7. The displayed count matches the freshly built archive
      const afterEmotes = await heroBarEmoteCount(page);
      expect(afterEmotes).toBe(after[key].data.emotesCount);
      expect(afterEmotes).toBeGreaterThan(0);
    });
  });
}