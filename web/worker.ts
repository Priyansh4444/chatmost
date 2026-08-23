/**
 * Server-side chat archive route (Cloudflare Worker).
 *
 * GET /api/archive?channel=<channel_name>  ->  CachedArchive JSON
 *
 * Serves a channel's deep chat archive from a server-side KV cache (gzipped),
 * instead of building it in the browser. The archive itself is produced by the
 * `build-server-archive` script (see web/scripts/build-server-archive.ts),
 * which runs the exact same ingestion code as the client and uploads the
 * finished archive to KV. Keeping the build out of the Worker avoids the
 * Workers CPU/memory limits (a multi-MB aggregate build is too heavy for an
 * edge isolate); the route only reads KV and serves.
 *
 * Runs alongside the static site: every non-API request falls through to
 * env.ASSETS (SPA + hashed assets).
 */

const DATA_KEY = (c: string) => `archive:${c}:data`;

/** Minimal structural types so the worker typechecks without @cloudflare/workers-types. */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  get(key: string, opts: { type: "arrayBuffer" }): Promise<ArrayBuffer | null>;
  get(key: string, opts: { type: "json" }): Promise<unknown>;
  put(key: string, value: string | ArrayBuffer, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  ARCHIVES: KVNamespace;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

async function handleArchive(channel: string, env: Env): Promise<Response> {
  const raw = await env.ARCHIVES.get(DATA_KEY(channel), { type: "arrayBuffer" });
  if (!raw) {
    // No server-side archive yet — the client falls back to its own build.
    return json({ status: "missing", stage: "", current: 0, total: 0, detail: `No server cache for #${channel} yet.` }, 404);
  }
  // Serve the gzipped bytes verbatim: the client's `res.json()` transparently
  // decompresses via Content-Encoding, so the Worker never parses the
  // multi-MB archive (which would blow its CPU budget). The archive JSON
  // already carries its own `builtAt`/`messages`/`days` from the build script.
  return new Response(raw, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-encoding": "gzip",
      "cache-control": "public, max-age=300",
      "vary": "Accept-Encoding",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/archive") {
      if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
      const channel = (url.searchParams.get("channel") ?? "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (!channel) return json({ error: "missing channel" }, 400);
      return handleArchive(channel, env);
    }
    return env.ASSETS.fetch(request);
  },
};
