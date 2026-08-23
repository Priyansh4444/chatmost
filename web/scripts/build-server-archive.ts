/**
 * Builds a channel's deep chat archive on the build machine (not the browser)
 * and uploads it to the server-side KV cache served by the `/api/archive`
 * route. Uses the exact same ingestion code as the client, so counts match.
 *
 * Usage:  bun web/scripts/build-server-archive.ts <channel>
 */

import { buildChatArchive } from "../src/lib/chatIngest";
import { loadDynamicStreamerData } from "../src/lib/dynamicStreamer";
import { execSync } from "node:child_process";

const channel = (process.argv[2] ?? "").trim().toLowerCase().replace(/^#/, "");
const root = `${import.meta.dir}/../..`;

if (!channel) {
  console.error("usage: bun web/scripts/build-server-archive.ts <channel>");
  process.exit(1);
}

console.log(`Building server archive for #${channel}…`);
const seData = await loadDynamicStreamerData(channel);
if (!seData) {
  console.error(`Could not resolve #${channel} (StreamElements/emotes unavailable).`);
  process.exit(1);
}

const archive = await buildChatArchive(
  channel,
  seData,
  (p) => {
    if (p.detail) console.error(`[${new Date().toISOString()}] ${p.stage} — ${p.detail}`);
  },
  () => false
);
const text = JSON.stringify(archive);
const gz = Bun.gzipSync(text);
const tmp = `/tmp/opencode/archive-${channel}.gz`;
await Bun.write(tmp, gz);
console.log(
  `#${channel}: ${archive.messages.toLocaleString()} msgs · ${archive.days} days · source=${archive.source} · ` +
    `json ${(text.length / 1048576).toFixed(1)} MiB → gz ${(gz.length / 1048576).toFixed(1)} MiB`
);

const dataKey = `archive:${channel}:data`;
const meta = JSON.stringify({
  builtAt: Date.now(),
  messages: archive.messages,
  days: archive.days,
  source: archive.source,
});
const metaKey = `archive:${channel}:meta`;

console.log(`Uploading ${dataKey} (${(gz.length / 1048576).toFixed(1)} MiB) → KV…`);
execSync(`npx wrangler kv key put --remote --binding=ARCHIVES "${dataKey}" --path="${tmp}"`, {
  stdio: "inherit",
  cwd: root,
});
execSync(`npx wrangler kv key put --remote --binding=ARCHIVES "${metaKey}" '${meta}'`, {
  stdio: "inherit",
  cwd: root,
});
console.log(`Done. GET /api/archive?channel=${channel} will now serve the cached archive.`);
