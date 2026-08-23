import { expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DB_NAME = "chatmost-archives";
export const DB_STORE = "archives";
export const CACHE_VERSION = "v11";

export interface CachedArchiveFixture {
  channel: string;
  builtAt: number;
  source: "zonian" | "vods";
  videos: number;
  days: number;
  messages: number;
  data: {
    emotesCount: number;
    chatters: unknown[];
    stats?: { messages?: number };
    streamelements?: { stats?: { emotes?: number } };
  };
}

export function testChannels(): string[] {
  return (process.env.CHATMOSH_TEST_CHANNELS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function readFixture(channel: string): CachedArchiveFixture {
  const filePath = join(__dirname, "fixtures", `${channel}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`Fixture file not found: ${filePath}`);
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

/**
 * Prime the app's IndexedDB archive store with a prebuilt channel
 * archive BEFORE the app boots, so tests run against fixture data instantly
 * (fresh builtAt, so no background incremental sync fires).
 */
export async function seedArchive(page: Page, channel: string) {
  const json = JSON.stringify(readFixture(channel));
  await page.addInitScript(
    ({ dbName, storeName, version, channel, json }) => {
      const archive = JSON.parse(json);
      archive.builtAt = Date.now();
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) {
          req.result.createObjectStore(storeName);
        }
      };
      req.onerror = () => {
        /* noop */
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(storeName, "readwrite");
        tx.objectStore(storeName).put(archive, `${channel}::${version}`);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      };
    },
    { dbName: DB_NAME, storeName: DB_STORE, version: CACHE_VERSION, channel, json }
  );
}

export async function readArchiveStore(page: Page): Promise<Record<string, any>> {
  return page.evaluate(
    async ({ dbName, storeName }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(dbName, 1);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      try {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        return await new Promise<Record<string, any>>((resolve, reject) => {
          const out: Record<string, any> = {};
          const cur = store.openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (!c) {
              resolve(out);
              return;
            }
            out[String(c.key)] = c.value;
            c.continue();
          };
          cur.onerror = () => reject(cur.error);
        });
      } finally {
        db.close();
      }
    },
    { dbName: DB_NAME, storeName: DB_STORE }
  );
}

/**
 * Load the channel, wait until the archive is ready (seeded → instant; the
 * ingest overlay must be gone), then jump to the Lexicon page where the hero
 * bar and emote counts live.
 */
export async function loadChannelReady(page: Page, channel: string) {
  await page.goto(`/?channel=${channel}`, { waitUntil: "domcontentloaded" });
  // Channel picked up in the top header
  await expect(page.locator("header span", { hasText: `#${channel}` }).first()).toBeVisible({ timeout: 60_000 });
  // Seeded archive never shows the blocking overlay; if one appears, the
  // build will be slow — fail fast with a clear message instead.
  await expect(page.locator("text=Building chat archive")).toHaveCount(0, { timeout: 5_000 });
  await page.getByRole("button", { name: "Lexicon" }).click();
  await expect(page.locator("text=Deep Archive").first()).toBeVisible({ timeout: 30_000 });
}

/** Emote count rendered in the hero bar ("<strong>N</strong> emotes"). */
export async function heroBarEmoteCount(page: Page): Promise<number | null> {
  const hero = page.locator("div.w-full.border").first();
  const text = (await hero.textContent().catch(() => null)) ?? "";
  const m = text.match(/([\d,]+)\s+emotes/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Emote count in the Lexicon header ("N tokens · N emotes · N words"). */
export async function exploreEmoteCount(page: Page): Promise<number | null> {
  const header = page.locator("div.flex.flex-wrap.items-baseline").first();
  const text = (await header.textContent().catch(() => null)) ?? "";
  const matches = [...text.matchAll(/([\d,]+)\s+emotes/g)];
  const last = matches[matches.length - 1];
  return last ? Number(last[1].replace(/,/g, "")) : null;
}
