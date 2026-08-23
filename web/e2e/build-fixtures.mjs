import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "http://localhost:5173";
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "fixtures");
const PROFILE = join(__dirname, ".profile");

const DB_NAME = "chatmost-archives";
const DB_STORE = "archives";

async function buildFixture(channel) {
  console.log(`\n=== building fixture for #${channel} ===`);
  const ctx = await chromium.launchPersistentContext(PROFILE, { headless: true });
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[dbg]")) console.log(`  ${t.slice(0, 180)}`);
  });

  await page.goto(`${BASE}/?channel=${channel}`, { waitUntil: "domcontentloaded" });

  const deadline = Date.now() + 20 * 60 * 1000;
  let done = null;
  while (Date.now() < deadline) {
    const heroText = await page.locator("div.w-full.border").first().textContent().catch(() => null) || "";
    if (heroText.includes("Deep Archive")) { done = "Deep Archive"; break; }
    if (heroText.includes("Archive Unavailable")) { done = "Archive Unavailable"; break; }
    if (heroText.includes("Live Sync Failed")) { done = "Live Sync Failed"; break; }
    const stage = await page.locator("[role=status] p.text-\\[11px\\]").textContent().catch(() => null);
    const detail = await page.locator("[role=status] p.text-\\[10px\\]").first().textContent().catch(() => null);
    if (stage || detail) console.log(`  ... ${stage?.trim()} | ${detail?.trim()}`);
    await page.waitForTimeout(5000);
  }
  if (!done) {
    console.log(`  FAILED: no terminal state within 20 min for #${channel}`);
    await ctx.close();
    process.exit(1);
  }
  console.log(`  terminal: ${done}`);

  const entry = await page.evaluate(async ({ dbName, storeName, channel }) => {
    const open = await new Promise((res, rej) => {
      const r = indexedDB.open(dbName, 1);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const db = open;
    const out = await new Promise((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const cur = tx.objectStore(storeName).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return resolve(null);
        if (String(c.key).startsWith(`${channel}::`)) return resolve(c.value);
        c.continue();
      };
    });
    db.close();
    return out;
  }, { dbName: DB_NAME, storeName: DB_STORE, channel });

  if (!entry) {
    console.log(`  FAILED: no cache entry in IndexedDB for #${channel}`);
    await ctx.close();
    process.exit(1);
  }

  mkdirSync(FIXTURES, { recursive: true });
  const file = join(FIXTURES, `${channel}.json`);
  writeFileSync(file, JSON.stringify(entry));
  console.log(`  wrote ${file} (${(JSON.stringify(entry).length / 1024 / 1024).toFixed(2)} MB, builtAt=${new Date(entry.builtAt).toISOString()}, messages=${entry.messages}, emotes=${entry.data.emotesCount})`);
  await ctx.close();
}

for (const c of process.argv.slice(2)) {
  await buildFixture(c);
}
console.log("\ndone.");